# Wafer — Technical Specification

Status: hackathon MVP (ETHGlobal NY 2026). Network: **Hedera Testnet (chain 296)**.
Vault: **Solidity smart contract** on Hedera EVM (HSCS), using HTS system contracts via
`@hiero-ledger/hiero-contracts`. Scripts + frontend: TypeScript (viem). All settlement in
**native HBAR**. Target track: **Hedera — Tokenization**.

> Single source of truth: the one-pager `Wafer — Pitchs Devrel.md` (validated by the Hedera
> devrels). This spec implements it literally: HTS tokens + a smart-contract vault + SaucerSwap.

---

## 1. Problem & product

DePIN operators (GPU/compute, wireless, mapping, energy) spend on hardware today but earn their
rewards on-chain over weeks/months. That timing gap is a financing problem — "InfraFi". Wafer
closes it: an operator sells a slice of its **future on-chain rewards** for upfront HBAR;
investors buy a fungible **pool-share** token = exposure to a basket of reward streams,
tradable/redeemable any time.

- Pools standardized by **network + risk** (e.g. `GPU-A`, `WIFI-B`, `ENERGY-A`). The vault is
  **permanent**; settled claims are replaced by new ones.
- The share is a **continuously-appreciating NAV unit** (like a money-market fund share),
  **not** a zero-coupon: NAV per share rises as reward HBAR flows in. No maturity on the share;
  maturity is a property of each underlying claim.
- Example: a GPU operator expects ~10,000 HBAR over 90 days, receives 9,000 today; the rewards
  flow into the vault, the ~1,000 spread is the yield, shared across holders.

## 2. Architecture

```
  operator ──finance/settle──▶┌──────────────────────────────────────┐◀──deposit/redeem── investor
                              │  WaferVault.sol  (Hedera EVM, HSCS)   │
                              │  via @hiero-ledger/hiero-contracts:   │
   front (Next.js, viem) ────▶│   • creates/holds HTS pool-share      │
   reads views + Mirror Node  │   • creates/holds reward-claim NFTs   │
                              │   • native HBAR settlement (payable)   │
                              │   • NAV, deposit, redeem, settle       │
                              └───────┬───────────────────┬───────────┘
                                      │ HTS @ 0x167        │ shares/HBAR
                              ┌───────▼────────┐   ┌───────▼────────┐
                              │  Hedera HTS    │   │  SaucerSwap V1 │  secondary market
                              │  (tokens)      │   │ (share/WHBAR)  │
                              └───────┬────────┘   └────────────────┘
                                      │ reads
                              ┌───────▼────────┐
                              │  Mirror Node   │──▶ frontend (balances, holders, logs)
                              └────────────────┘
```

- The **vault is a contract** → vault logic is on-chain and verifiable (verified on HashScan).
- **No backend API** (the contract is the backend; the front talks to it directly via a wallet).
- **No HCS topic** (contract events + Mirror Node are the audit/read layer).

## 3. The `WaferVault` contract

Toolchain: **Hardhat**, Solidity **0.8.24**, `@hiero-ledger/hiero-contracts@0.1.2`
(`@openzeppelin/contracts@^5.3.0`). Inherit `HederaTokenService, KeyHelper, ExpiryHelper,
FeeHelper`. The vault is the **treasury + SUPPLY + KYC + FREEZE key** (`KeyValueType.CONTRACT_ID`)
for the tokens it creates, so it mints/burns/grants-KYC/freezes with no off-chain signer.

```solidity
import "@hiero-ledger/hiero-contracts/token-service/HederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/IHederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/KeyHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/ExpiryHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/FeeHelper.sol";
import "@hiero-ledger/hiero-contracts/common/HederaResponseCodes.sol";
```

Storage:
```solidity
enum ClaimStatus { Active, Repaid, Defaulted }
enum PoolStatus  { Active, Paused }
struct Pool  { address shareToken; address claimNft; uint64 totalAssets; uint64 totalShares; uint8 status; }
struct Claim { address operator; uint64 principalTinybar; int64 nftSerial; uint32 poolId; ClaimStatus status; }
address public owner;                       // deployer EOA; gates admin funcs
mapping(uint32 => Pool)  public pools;     uint32 public poolCount;
mapping(uint256 => Claim) public claims;   uint256 public claimCount;
```

Settlement is **native HBAR** — there is no settlement-token address to set/associate; HBAR moves
via `payable` entrypoints (`msg.value`) and `call{value:}` payouts.

Functions (and the HTS call each makes):

| Function | Who | Does | HTS calls |
|---|---|---|---|
| `createPool(name,symbol)` **payable** | owner | new pool: share token + claim NFT (attach ~100 HBAR) | `createFungibleTokenWithCustomFees` (8dp, 0.10% fractional fee, INFINITE), `createNonFungibleToken`, `grantTokenKyc(share,this)` |
| `financeClaim(poolId,operator,principalTinybar,meta)` | owner | mint claim NFT to vault, advance HBAR | `mintToken(claimNft,0,[meta])`; `operator.call{value: principalTinybar}` |
| `deposit(poolId)` **payable** | investor | mint shares at NAV from `msg.value` HBAR | `grantTokenKyc(share,investor)` (auto), `mintToken(share,shares,[])`, `transferToken(share,this,investor,shares)` |
| `redeem(poolId,shares)` | investor | burn shares, pay HBAR at NAV | `transferToken(share,investor,this,shares)`, `burnToken(share,shares,[])`; `investor.call{value: assets}` |
| `settleRewards(poolId,claimId)` **payable** | operator | route reward HBAR (`msg.value`) into vault → NAV up | none — `totalAssets += msg.value` |
| `markDefault(claimId,burnNft)` | owner | write down a claim → NAV down | storage; optional `burnToken(claimNft,0,[serial])` |
| `navPerShare(poolId)` view | — | `totalShares==0 ? 1e8 : totalAssets*1e8/totalShares` | — |

Plus `poolCount()`, `pools(i)`, `shareBalanceOf(poolId,acct)`, `previewDeposit/previewRedeem`
views and `PoolCreated/Deposit/Redeem/ClaimFinanced/RewardRouted/Default` **events** (the front's
activity feed reads them via Mirror Node).

UNITS — **measured live, not assumed.** The Hedera EVM is **TINYBAR-internal**: a wallet attaches
value in weibar (1 HBAR = 1e18), but by the time the contract runs the relay has converted to
**tinybar** (1 HBAR = 1e8), so inside the contract `msg.value`, `address(this).balance`, and
`call{value:}` are **all tinybar**. The vault therefore accounts natively in tinybar with **no
conversion factor**, share decimals = 8 and `ONE = 1e8` (1 share ≈ 1 HBAR at genesis NAV). A probe
contract confirmed this: sending 2 HBAR made `msg.value == 2e8` and `call{value: 1e8}` moved exactly
1 HBAR while `call{value: 1e18}` failed. Only the JSON-RPC boundary (handled by the relay/front)
uses weibar. Pure-logic unit tests pin the NAV/round-trip math (`test/hbar-units.test.ts`).

## 4. HTS-from-Solidity patterns (load-bearing details)

- **Token create is `payable`**: the create path does `.call{value: ...}` to the precompile
  (`0x167`). `createPool` makes **two** creates in one tx (fungible-with-fees ~60 HBAR + NFT
  ~30 HBAR); the inherited helpers hardcode `call{value: msg.value}` and can't fund two creates
  in one tx, so the contract calls the precompile **directly**, forwarding `address(this).balance`
  to each create (the precompile refunds the excess to the contract). Attach **~100 HBAR** to
  `createPool` and set `gasLimit` **10M**. Excess refunds to the contract and stays as working HBAR.
- **Always check `responseCode == 22 (SUCCESS)` and revert** — a low-level `.call` returns
  `success=true` even on an HTS business error. (Or use `SafeHTS` reverting wrappers.)
- **Association**: an account must associate a token before holding it. Vault auto-associates
  tokens it creates (it's treasury). Settlement is **native HBAR**, so there is **no settlement
  token to associate**. Investors still associate the **share** token themselves from their wallet
  via the **IHRC719 facade** (`associate()`), or via an auto-association slot — the contract can't
  associate a third party, so the front does this before the first `deposit`.
- **KYC-gated transfer**: with a KYC key, *both* parties to a transfer must be KYC-granted, else
  `ACCOUNT_KYC_NOT_GRANTED`. Order: associate → `grantTokenKyc` → transfer. Vault grants itself
  KYC at pool creation and **auto-grants the investor on first `deposit`** (frictionless).
- **HBAR in/out**: deposit/settle receive HBAR as `msg.value` (payable); financeClaim/redeem pay
  out via `call{value:}`. No ERC-20 `approve`/`transferFrom` for settlement. For **redeem**, the
  investor must first `approve(vault, shares)` on the **share token** (ERC-20 facade via HIP-376)
  so the vault can pull the shares to burn them — the only allowance the flow needs.

## 5. SaucerSwap integration (V1, testnet)

Use **V1 (Uniswap-v2 style)** — one call creates the pool + seeds liquidity. Live router:
**`SaucerSwapV1RouterV3 = 0.0.19264`** (EVM `0x…4b40`); Factory `0.0.9959`.

- **Pair = share / WHBAR** (wrapped HBAR), since settlement is native HBAR. Either seed the pair
  directly against **WHBAR** or use the router's HBAR-native entrypoints (`addLiquidityETH` /
  `swapExactETHForTokens`), which wrap HBAR→WHBAR under the hood.
- **Create pool**: `addLiquidityNewPool(tokenA,tokenB,aDesired,bDesired,aMin,bMin,to,deadline)`
  **payable** — the ratio you seed = the initial share/WHBAR price (e.g. 1000:1000 → 1.00). The
  **pool-creation fee is ~$50 USD in HBAR**: read `factory.pairCreateFee()` (tinycent), convert
  via Mirror Node `/api/v1/network/exchangerate`, pass as `msg.value` (tinybar→weibar ×1e10,
  +10% buffer). Gas ~3.2M.
- **Prereqs**: associate both tokens; **+1 auto-association** to receive the LP token; **approve
  RouterV3** for both amounts (HIP-376 ERC-20 facade `approve`).
- `addLiquidity(...)` (no fee), `swapExactTokensForTokens(amountIn,minOut,[in,out],to,deadline)`.
- ⚠️ The $50 testnet-HBAR fee can be hundreds of HBAR → see §11. SaucerSwap is the part most
  likely to be HBAR-blocked; **redeem-at-NAV is the guaranteed exit**, SaucerSwap is the bonus.

## 6. Frontend (Vite + React 19 + viem, MetaMask)

The investor dApp lives in `web/` — a **Vite 6 + React 19** single-page app using **viem 2**,
reusing a shared scaffold (wallet hook, contract hook, status/error/format libs, EIP-6963 wallet
discovery, landing page). No Next.js / Tailwind / shadcn — styling is plain CSS with neutral class
names so a designer can restyle without touching logic.

- **Chain 296** via a viem `defineChain` (`hederaTestnet`, RPC `https://testnet.hashio.io/api`,
  explorer `https://hashscan.io/testnet`). ⚠️ `nativeCurrency.decimals = 18` (EVM weibar) at the
  RPC boundary — viem builds `value` in weibar, the relay converts to tinybar for the contract.
  Shares are 8-dp; NAV/tinybar are 8-dp. (Settlement is HBAR; this increment leaves `web/` in mock
  mode — the next increment rewires it to HBAR + the deployed address.)
- **Wallet**: **MetaMask** (and any EIP-1193 / EIP-6963 browser wallet) — `useWallet` builds a viem
  public client (reads) + wallet client (writes), auto-reconnects via silent `eth_accounts`, and
  switches/adds chain 296. No Privy, no env private key in the frontend.
- **Gas override**: HTS-touching calls pin `gas` (~1M) and set `maxFeePerGas = liveBaseFee × 5 +
  tip` (Hashio mis-estimates the same way other testnet relays do) — see `useContracts`.
- **Writes**: deposit flow = `ensureAssociated(share)` (IHRC719 `associate()` on the share token's
  EVM address) → `deposit(poolId, { value: hbar })` (payable, native HBAR — no settlement approve);
  redeem = `approve(vault, shares)` (share ERC-20 facade so the vault can pull them) →
  `redeem(poolId, shares)` at NAV (the guaranteed exit).
- **Reads**: NAV/pools/balances from contract `view`s (`navPerShare`, `poolCount`, `pools`,
  `shareBalanceOf`); activity/holders from Mirror Node (`/api/v1/contracts/{id}/results/logs`,
  `/tokens/{id}`, `/balances`, `/accounts/{evm}`).
- **Mock mode this increment**: `WaferVault.sol` is now built, deployed, and verified on testnet
  (see `deployments/testnet.json`), but `web/` still ships a placeholder ABI + addresses + mock
  pool/activity data and runs in **mock mode** (`MOCK_MODE`) until rewired. The next increment
  points it at the deployed `VITE_VAULT_ADDRESS`, swaps the ABI for the real one, and converts the
  deposit flow to native HBAR (8-dp shares/NAV).
- `lib/config.js` (chain + addresses + `MOCK_MODE` + placeholder pools), `lib/abi.js` (vault +
  ERC-20 + IHRC719), `lib/format.js` (NAV/preview math), `lib/mirror.js` (Mirror Node REST),
  `lib/errors.js`, `lib/providers.js`. Screens: **Pools** (NAV/TVL/risk), **Deposit/Redeem**
  (per-pool, with the association flow + share-approve on redeem), **Activity** (event feed),
  **Dashboard** (the wallet's share balances + value). Run instructions in `web/README.md`.

## 7. Settlement asset

The settlement asset is **native HBAR** — Hedera's own currency, real on testnet, 8-dp (tinybar).
No settlement token, no association, no allowance, no faucet bridge: deposits/settlements arrive as
`msg.value` and redemptions/advances pay out via `call{value:}`. The operator (`0.0.9185964`) holds
~1000 testnet HBAR, which funds both gas and the vault's HBAR flows. There is no "mock vs real"
question — HBAR is native and real — so the earlier "real USDC only / no mock" policy is moot and
removed.

Production target: **USDC** for stable denomination (DePIN rewards are typically priced in a
stablecoin). HBAR is the right MVP choice on testnet (native, frictionless, no faucet/association),
and the vault generalizes to an HTS settlement token without a logic rewrite.

## 8. Trust model

With the vault as a contract, all vault logic (mint/burn, NAV, settlement) is **on-chain and
verifiable** (contract verified on HashScan; events + Mirror Node reconcile state). The contract
holds the token keys (`CONTRACT_ID`), so no off-chain key custody for token ops. `owner` (the
deployer EOA) gates admin funcs (`createPool`, `financeClaim`, `markDefault`); `deposit`/`redeem`
are permissionless (after KYC). Production hardening: move `owner` to a multisig; add a risk
oracle. Native-HBAR on-chain settlement removes any fiat-bridge trust (no token issuer in the loop).

## 9. Scope

IN (MVP): the `WaferVault` contract, **native-HBAR settlement**, **1 pool (GPU-A)** end-to-end
(finance → deposit → settle/NAV-rise → redeem) — **live + verified on testnet, lifecycle proven by
`pnpm smoke`**, one **SaucerSwap pool + swap** (best-effort, HBAR-permitting), the wired frontend
skeleton. OUT: HCS topic, backend API, Privy/Arc/ENS, AI agent, real DePIN network integration,
senior/junior tranches, internal lending, an HTS/USDC settlement option (all V2).

## 10. Toolchain & deploy

Hardhat + `@nomicfoundation/hardhat-toolbox`, Solidity 0.8.24 (optimizer + `viaIR`), network
`testnet` (`https://testnet.hashio.io/api`, chainId 296, operator ECDSA key). The repo is ESM, so
the Hardhat config is `hardhat.config.cts` (CommonJS) loaded via `tsconfig.hardhat.json`. Scripts:
`pnpm run deploy` (deploy + `createPool` funded ~100 HBAR `msg.value`, persists ids to
`deployments/testnet.json` + `VAULT_ADDRESS` to `.env`), `pnpm run smoke` (full lifecycle live),
`pnpm run verify <addr>`. Verify on **Sourcify** (chain 296 is indexed at `sourcify.dev/server`;
HashScan reads the verified contract from there — `repo.sourcify.dev`). viem for the SaucerSwap +
front. ⚠️ `pnpm deploy` collides with pnpm's built-in command — use `pnpm run deploy`.

## 11. Known blockers & footguns (read before the build)

- **HBAR funding.** `createPool` does two HTS creates and forwards the full balance to each
  (precompile refunds excess), so attach **~100 HBAR**; SaucerSwap pool = ~$50 in testnet HBAR.
  The operator (`0.0.9185964`) holds **~1000 testnet HBAR — sufficient**; each full deploy+smoke
  cycle spends ~90 HBAR net (mostly the non-refunded create cost), so re-deploying many times can
  draw the balance down — keep spend lean and watch for `INSUFFICIENT_PAYER_BALANCE`.
- **TINYBAR-internal EVM** (the #1 units footgun, measured not assumed): inside the contract
  `msg.value`, `address(this).balance`, and `call{value:}` are all **tinybar** (1 HBAR = 1e8), even
  though the RPC boundary uses weibar (1e18). Account in tinybar with **no conversion**; convert
  only in the front/relay layer. A wrong factor silently drains/inflates the vault.
- **KYC ordering** is a demo footgun: associate (investor, share token, via IHRC719) → `grantKyc`
  (auto, by the vault on deposit) → transfer. No settlement-token association/allowance (HBAR).
- **Allowance before redeem**: investor must `approve(vault, shares)` on the **share** token so the
  vault can pull and burn them. Deposit needs no allowance (it's payable HBAR).
- **Pin gas** on HTS-touching calls (Hashio mis-estimates) and check `SUCCESS (22)`.
- **`pnpm deploy` is shadowed** by pnpm's built-in deploy command — always `pnpm run deploy`.
