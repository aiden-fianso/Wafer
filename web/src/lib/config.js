// Wafer network + address config — Hedera Testnet (chain 296).
//
// Money rule: pool shares and pool accounting are 8-decimal integer units
// (tinybar / share micro-units), matching the WaferVault contract. Settlement is
// native HBAR — there is no ERC-20 settlement token. HBAR is 18 decimals EVM-side
// (weibar) for msg.value / gas; that boundary is handled in useContracts.js.

export const CHAIN_ID = 296;
export const CHAIN_NAME = "Hedera Testnet";

// Public Hedera EVM relay (JSON-RPC) and Mirror Node REST base.
export const RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://testnet.hashio.io/api";
export const MIRROR_NODE_URL =
  import.meta.env.VITE_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";
export const EXPLORER_URL = "https://hashscan.io/testnet";

export const NATIVE_CURRENCY = { name: "HBAR", symbol: "HBAR", decimals: 18 };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ADDRESSES = {
  // TODO(deploy): set VITE_VAULT_ADDRESS once WaferVault.sol is deployed +
  // verified on HashScan. Until then this stays the zero address and the app
  // runs in MOCK_MODE (see below) with placeholder pool/activity data.
  vault: (import.meta.env.VITE_VAULT_ADDRESS || ZERO_ADDRESS).toLowerCase(),

  // TODO(deploy): the per-pool share token is normally read from the contract's
  // pools(poolId).shareToken view. This optional override is only used by the
  // association step before the contract exposes the real address.
  shareToken: (import.meta.env.VITE_SHARE_TOKEN || ZERO_ADDRESS).toLowerCase(),
};

// Mock mode: when the vault address is unset (zero), the contract isn't
// deployed yet — the UI renders from placeholder data so a designer can work on
// the shell. Flip automatically once VITE_VAULT_ADDRESS points at a real vault.
export const MOCK_MODE = ADDRESSES.vault === ZERO_ADDRESS;

// Placeholder pools shown in mock mode (and used as display metadata even once
// live — network/risk labels aren't on-chain). poolId matches the contract's
// pools(uint32) index. navPerShare / totalAssets / totalShares are 8-dp units
// (tinybar); mock values give a realistic NAV > 1.00.
export const MOCK_POOLS = [
  {
    poolId: 0,
    name: "GPU-A",
    network: "GPU / Compute",
    risk: "A",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 104_200_000n, // 1.042 HBAR / share
    totalAssets: 18_450_000_000_000n, // 184,500 HBAR
    totalShares: 17_706_334_000_000n,
    status: 0, // Active
  },
  {
    poolId: 1,
    name: "WIFI-B",
    network: "Wireless",
    risk: "B",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 101_850_000n, // 1.0185 HBAR / share
    totalAssets: 6_230_000_000_000n, // 62,300 HBAR
    totalShares: 6_116_838_300_000n,
    status: 0, // Active
  },
  {
    poolId: 2,
    name: "ENERGY-A",
    network: "Energy",
    risk: "A",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 100_790_000n, // 1.0079 HBAR / share
    totalAssets: 2_890_000_000_000n, // 28,900 HBAR
    totalShares: 2_867_347_900_000n,
    status: 0, // Active
  },
];

// Placeholder activity feed (mock mode). Once the vault is deployed, Activity
// reads real events from the Mirror Node — see lib/mirror.js. Amounts are 8-dp
// units (tinybar).
export const MOCK_ACTIVITY = [
  { type: "Deposit", poolId: 0, account: "0x00000000000000000000000000000000004f1a2b", assets: 500_000_000_000n, shares: 479_846_400_000n, ageSeconds: 90 },
  { type: "RewardRouted", poolId: 0, claimId: 3, assets: 120_000_000_000n, ageSeconds: 640 },
  { type: "Redeem", poolId: 1, account: "0x0000000000000000000000000000000000a3c918", assets: 250_000_000_000n, shares: 245_450_000_000n, ageSeconds: 1820 },
  { type: "ClaimFinanced", poolId: 0, claimId: 4, assets: 900_000_000_000n, ageSeconds: 5400 },
  { type: "Default", poolId: 2, claimId: 1, assets: 40_000_000_000n, ageSeconds: 86_400 },
];
