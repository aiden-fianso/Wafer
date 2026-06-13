// Wafer network + address config — Hedera Testnet (chain 296).
//
// Money rule: USDC and pool shares are both 6-decimal integer micro-units.
// HBAR (the native gas currency) is 18 decimals EVM-side — kept entirely
// separate from the 6-dp accounting below.

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

// Native Circle USDC on Hedera testnet: 0.0.429274 → EVM 0x...068cda (6 dp).
// This is a REAL token (never a mock) per SPEC §7.
const USDC_DEFAULT = "0x0000000000000000000000000000000000068cda";

export const ADDRESSES = {
  // TODO(deploy): set VITE_VAULT_ADDRESS once WaferVault.sol is deployed +
  // verified on HashScan. Until then this stays the zero address and the app
  // runs in MOCK_MODE (see below) with placeholder pool/activity data.
  vault: (import.meta.env.VITE_VAULT_ADDRESS || ZERO_ADDRESS).toLowerCase(),

  // Settlement token (USDC). Real testnet token by default.
  usdc: (import.meta.env.VITE_USDC_ADDRESS || USDC_DEFAULT).toLowerCase(),

  // TODO(deploy): the per-pool share token is normally read from the contract's
  // pools(poolId).shareToken view. This optional override is only used by the
  // association step before the contract exposes the real address.
  shareToken: (import.meta.env.VITE_SHARE_TOKEN || ZERO_ADDRESS).toLowerCase(),
};

// Hedera account ids (human-readable form) for display / explorer links.
export const HEDERA_IDS = {
  usdc: "0.0.429274",
};

// Mock mode: when the vault address is unset (zero), the contract isn't
// deployed yet — the UI renders from placeholder data so a designer can work on
// the shell. Flip automatically once VITE_VAULT_ADDRESS points at a real vault.
export const MOCK_MODE = ADDRESSES.vault === ZERO_ADDRESS;

// Placeholder pools shown in mock mode (and used as display metadata even once
// live — network/risk labels aren't on-chain). poolId matches the contract's
// pools(uint256) index. navPerShare / totalAssets / totalShares are 6-dp
// micro-units; mock values give a realistic NAV > 1.00.
export const MOCK_POOLS = [
  {
    poolId: 0,
    name: "GPU-A",
    network: "GPU / Compute",
    risk: "A",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 1_042_000n, // 1.042000 USDC / share
    totalAssets: 184_500_000_000n, // 184,500.00 USDC
    totalShares: 177_063_340_000n,
    status: 1, // Active
  },
  {
    poolId: 1,
    name: "WIFI-B",
    network: "Wireless",
    risk: "B",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 1_018_500n, // 1.018500 USDC / share
    totalAssets: 62_300_000_000n, // 62,300.00 USDC
    totalShares: 61_168_383_000n,
    status: 1, // Active
  },
  {
    poolId: 2,
    name: "ENERGY-A",
    network: "Energy",
    risk: "A",
    networkLogo: "/logos/hedera.svg",
    navPerShare: 1_007_900n, // 1.007900 USDC / share
    totalAssets: 28_900_000_000n, // 28,900.00 USDC
    totalShares: 28_673_479_000n,
    status: 1, // Active
  },
];

// Placeholder activity feed (mock mode). Once the vault is deployed, Activity
// reads real events from the Mirror Node — see lib/mirror.js.
export const MOCK_ACTIVITY = [
  { type: "Deposit", poolId: 0, account: "0x00000000000000000000000000000000004f1a2b", assets: 5_000_000_000n, shares: 4_798_464_000n, ageSeconds: 90 },
  { type: "RewardRouted", poolId: 0, claimId: 3, assets: 1_200_000_000n, ageSeconds: 640 },
  { type: "Redeem", poolId: 1, account: "0x0000000000000000000000000000000000a3c918", assets: 2_500_000_000n, shares: 2_454_500_000n, ageSeconds: 1820 },
  { type: "ClaimFinanced", poolId: 0, claimId: 4, assets: 9_000_000_000n, ageSeconds: 5400 },
  { type: "Default", poolId: 2, claimId: 1, assets: 400_000_000n, ageSeconds: 86_400 },
];
