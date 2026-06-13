// Wafer contract interfaces (PLACEHOLDER).
//
// These ABIs mirror SPEC §3 of the WaferVault contract, which is NOT yet built
// or deployed. They are written so the frontend can be wired now and "just
// work" once the real contract lands at VITE_VAULT_ADDRESS. If the deployed
// contract's signatures differ, update this file (it is the single source of
// truth the hooks read from).
//
// Money: USDC and shares are 6-dp integer micro-units (uint256 here). Pool
// status is a uint8 enum (0 = Inactive/None, 1 = Active, 2 = Paused — match the
// contract's ClaimStatus/Pool status when deployed).

export const VAULT_ABI = [
  // ---- Views ----
  // navPerShare = totalShares == 0 ? 1e6 : totalAssets * 1e6 / totalShares (6 dp)
  { name: "navPerShare", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "poolCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  // pools(poolId) → (shareToken, totalShares, totalAssets, status)
  {
    name: "pools",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "uint256" }],
    outputs: [
      { name: "shareToken", type: "address" },
      { name: "totalShares", type: "uint256" },
      { name: "totalAssets", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  { name: "shareBalanceOf", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint256" }, { name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },

  // ---- Writes ----
  // deposit(poolId, assets) → shares minted (6 dp). Caller must have associated
  // the share token (IHRC719) and approved USDC to the vault first (SPEC §6).
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "poolId", type: "uint256" }, { name: "assets", type: "uint256" }], outputs: [{ name: "shares", type: "uint256" }] },
  // redeem(poolId, shares) → assets returned (6 dp).
  { name: "redeem", type: "function", stateMutability: "nonpayable", inputs: [{ name: "poolId", type: "uint256" }, { name: "shares", type: "uint256" }], outputs: [{ name: "assets", type: "uint256" }] },

  // ---- Events (read by the Activity feed via Mirror Node) ----
  { type: "event", name: "Deposit", inputs: [
    { name: "poolId", type: "uint256", indexed: true },
    { name: "investor", type: "address", indexed: true },
    { name: "assets", type: "uint256", indexed: false },
    { name: "shares", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "Redeem", inputs: [
    { name: "poolId", type: "uint256", indexed: true },
    { name: "investor", type: "address", indexed: true },
    { name: "shares", type: "uint256", indexed: false },
    { name: "assets", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "ClaimFinanced", inputs: [
    { name: "poolId", type: "uint256", indexed: true },
    { name: "claimId", type: "uint256", indexed: true },
    { name: "operator", type: "address", indexed: true },
    { name: "principal", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "RewardRouted", inputs: [
    { name: "poolId", type: "uint256", indexed: true },
    { name: "claimId", type: "uint256", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "Default", inputs: [
    { name: "poolId", type: "uint256", indexed: true },
    { name: "claimId", type: "uint256", indexed: true },
    { name: "writedown", type: "uint256", indexed: false },
  ] },
];

// ERC-20 facade for USDC (HIP-376) — used for approve before deposit and for
// reading the wallet's USDC balance/allowance.
export const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
];

// IHRC719 association facade — every HTS token EVM address exposes these. An
// account must associate a token before it can hold it (SPEC §4). Investors
// associate the share token themselves from their wallet via associate().
export const IHRC719_ABI = [
  { name: "associate", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "responseCode", type: "int64" }] },
  { name: "dissociate", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "responseCode", type: "int64" }] },
  { name: "isAssociated", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
];
