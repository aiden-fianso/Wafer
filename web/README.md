# Wafer web — investor dApp

Investor-facing dApp for Wafer: InfraFi liquidity for DePIN on **Hedera Testnet (chain 296)**.
Connect a wallet, browse pools, deposit **HBAR** to mint NAV-appreciating pool shares, redeem at NAV,
and watch the vault activity feed.

## Stack

- **Vite 6** + **React 19** (scaffolded as a single-page app, no SSR)
- **viem 2** against the Hedera EVM relay (Hashio, `https://testnet.hashio.io/api`, chain id **296**)
- **MetaMask** (and any EIP-1193 / EIP-6963 browser wallet) for connect + signing
- **Hedera Mirror Node** REST for reads (activity logs, balances) — no backend API
- `globe.gl` / `three` / `motion` for the landing page

`WaferVault.sol` is deployed + verified on testnet (see `deployments/testnet.json`) and `lib/abi.js`
matches the deployed contract. The live vault + pool-0 share-token addresses are baked in as defaults
(`src/lib/config.js`), so the app talks to the **live vault** out of the box (`MOCK_MODE` OFF). Set
`VITE_VAULT_ADDRESS=0x0…0` to force mock mode (placeholder pools/activity, stubbed deposit/redeem) for
design work without a connection.

## Run

```bash
cd web
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # production build → dist/
pnpm preview  # serve the production build
```

Requires Node 22 (see repo `.nvmrc`) and pnpm.

## Configuration

All config has live defaults; `.env` is only for overrides (all values are **public** frontend config
— never put private keys here; `.env` is gitignored). Copy `.env.example` → `.env` to override:

| Var | Meaning |
|---|---|
| `VITE_VAULT_ADDRESS` | WaferVault EVM address. Defaults to the live deploy; set `0x0…0` for mock mode. |
| `VITE_SHARE_TOKEN` | Pool-0 share token EVM address (defaults to the live one; normally read from `pools(id)`). |
| `VITE_RPC_URL` | Hedera EVM relay (defaults to Hashio). |
| `VITE_MIRROR_NODE_URL` | Mirror Node base (defaults to the public testnet node). |

When `VITE_VAULT_ADDRESS` is the zero address, `MOCK_MODE` is on: pools, activity, and balances
render from placeholders in `src/lib/config.js`, and deposit/redeem are stubbed (the full deposit
`associate → deposit` and redeem `approve → redeem` flows still run, just without a real tx).

## Money rules

Settlement is **native HBAR**. Pool shares and pool accounting are **8-decimal integer units**
(tinybar, `bigint`) end-to-end — matching the contract (`ONE = 1e8`); formatting happens only at the
display edge (`src/lib/format.js`). At the RPC boundary HBAR is 18-decimal weibar (`msg.value`,
`eth_getBalance`); `useContracts.js` converts weibar↔tinybar (×/÷ 1e10) there and nowhere else.

## Layout

```
src/
  App.jsx                       tabbed shell (Pools · Deposit · Activity · Dashboard) + landing
  main.jsx                      React root + chunk-reload guard
  hooks/
    useWallet.js                viem wallet/public client, MetaMask, Hedera 296, auto-reconnect
    useContracts.js             getContract wrappers, gas override, deposit/redeem + HTS flow
  lib/
    config.js                   chain + addresses + MOCK_MODE + placeholder pools/activity
    abi.js                      WaferVault ABI (matches contracts/) + HTS ERC-20 + IHRC719 facades
    format.js                   8-dp tinybar money helpers + NAV/preview math
    mirror.js                   Mirror Node reads (activity logs, token supply/holders, aggregate stats)
    errors.js                   wallet/revert → friendly messages (HBAR/association/KYC)
    providers.js                EIP-6963 wallet discovery
  components/
    Pools.jsx                   pool list → DepositWidget detail
    DepositWidget.jsx           deposit/redeem with NAV preview + associate/approve flows
    Activity.jsx                vault event feed (Mirror Node)
    Dashboard.jsx               connected wallet's share balances + value
    Header.jsx, StatusBar.jsx, WalletModal.jsx, ErrorBoundary.jsx
    LandingPage/                hero globe, beams, scroll, FAQ, contact
```

## Wiring (live)

1. `WaferVault.sol` is deployed + verified (see SPEC §10 / `deployments/testnet.json`); the vault and
   pool-0 share-token addresses are baked into `src/lib/config.js` as defaults, so `MOCK_MODE` is OFF.
2. To point at a different deploy, set `VITE_VAULT_ADDRESS` / `VITE_SHARE_TOKEN` in `.env`.
3. `lib/abi.js` matches the deployed signatures (uint32 poolId, uint64 tinybar amounts, `deposit`
   payable, `redeem`); it is the single source of truth the hooks read from.
4. Pool display metadata (network/risk labels) lives in `src/lib/config.js#MOCK_POOLS` keyed by
   `poolId` — keep it in sync with on-chain pool ids, or move it on-chain later.
