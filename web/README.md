# Wafer web — investor dApp

Investor-facing dApp for Wafer: InfraFi liquidity for DePIN on **Hedera Testnet (chain 296)**.
Connect a wallet, browse pools, deposit USDC to mint NAV-appreciating pool shares, redeem at NAV,
and watch the vault activity feed.

## Stack

- **Vite 6** + **React 19** (scaffolded as a single-page app, no SSR)
- **viem 2** against the Hedera EVM relay (Hashio, `https://testnet.hashio.io/api`, chain id **296**)
- **MetaMask** (and any EIP-1193 / EIP-6963 browser wallet) for connect + signing
- **Hedera Mirror Node** REST for reads (activity logs, balances) — no backend API
- `globe.gl` / `three` / `motion` for the landing page

The vault contract (`WaferVault.sol`) is **not deployed yet**, so the app ships with a
**placeholder ABI + placeholder addresses + mock data** and runs in **mock mode** until you wire a
real `VITE_VAULT_ADDRESS`. The UI renders fully so a designer can restyle it now.

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

Copy `.env.example` → `.env` and fill in once the contract is deployed (all values are **public**
frontend config — never put private keys here; `.env` is gitignored):

| Var | Meaning |
|---|---|
| `VITE_VAULT_ADDRESS` | WaferVault EVM address. Leave as `0x0…0` for mock mode. |
| `VITE_SHARE_TOKEN` | Optional pool-0 share token EVM address (normally read from `pools(id)`). |
| `VITE_USDC_ADDRESS` | Settlement USDC EVM address (defaults to testnet Circle USDC `0x…068cda`). |
| `VITE_RPC_URL` | Hedera EVM relay (defaults to Hashio). |
| `VITE_MIRROR_NODE_URL` | Mirror Node base (defaults to the public testnet node). |

When `VITE_VAULT_ADDRESS` is the zero address, `MOCK_MODE` is on: pools, activity, and balances
render from placeholders in `src/lib/config.js`, and deposit/redeem are stubbed (the full
association → approve → deposit flow is still exercised, just without a real tx).

## Money rules

USDC and pool shares are **6-decimal integer micro-units** (`bigint`) end-to-end; formatting
happens only at the display edge (`src/lib/format.js`). HBAR (native gas) is 18-decimal EVM-side
and kept entirely separate.

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
    abi.js                      WaferVault placeholder ABI (SPEC §3) + ERC-20 + IHRC719 facades
    format.js                   6-dp money helpers + NAV/preview math
    mirror.js                   Mirror Node reads (activity logs, aggregate stats)
    errors.js                   wallet/revert → friendly messages (HBAR/association/allowance)
    providers.js                EIP-6963 wallet discovery
  components/
    Pools.jsx                   pool list → DepositWidget detail
    DepositWidget.jsx           deposit/redeem with NAV preview + association/approve flow
    Activity.jsx                vault event feed (Mirror Node)
    Dashboard.jsx               connected wallet's share balances + value
    Header.jsx, StatusBar.jsx, WalletModal.jsx, ErrorBoundary.jsx
    LandingPage/                hero globe, beams, scroll, FAQ, contact
```

## Wiring the real contract (TODO after deploy)

1. Deploy `WaferVault.sol` (Hardhat, see SPEC §10), verify on HashScan.
2. Set `VITE_VAULT_ADDRESS` in `.env` to the vault's EVM address → flips off mock mode.
3. Confirm the deployed function/event signatures match `src/lib/abi.js`; adjust if they differ
   (it is the single source of truth the hooks read from).
4. Pool display metadata (network/risk labels) lives in `src/lib/config.js#MOCK_POOLS` keyed by
   `poolId` — keep it in sync with on-chain pool ids, or move it on-chain later.
```
