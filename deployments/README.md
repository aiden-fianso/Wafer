# deployments/

Public, committed record of the live Hedera Testnet resources created by `pnpm run deploy`.

- `testnet.json` — the deployed `WaferVault` EVM address + Hedera contract id, the pool's HTS
  share token + claim-NFT ids, the pool id, and HashScan / Sourcify links for the current demo
  pool. Written by `scripts/deploy.ts` (which also writes `VAULT_ADDRESS` into the gitignored
  `.env`).

Only **public ids** live here — never private keys. A clean clone reads this file (and the
gitignored `.env`) to know which live vault/pool to talk to. Settlement is native HBAR, so there
is no settlement-token id to record.
