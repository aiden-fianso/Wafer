// Wafer contract interfaces — mirrors the deployed WaferVault.sol (contracts/).
//
// This is the single source of truth the hooks read from. Types match the
// contract exactly (uint32 poolId, uint64 tinybar amounts) so viem computes the
// right selectors / decodes events correctly.
//
// Money: HBAR and shares are 8-dp integer units (tinybar). Settlement is native
// HBAR — deposit is `payable` (msg.value), there is no ERC-20 settlement token.
// Pool status is a uint8 enum (0 = Active, 1 = Paused).

export const VAULT_ABI = [
  // ---- Views ----
  // navPerShare = totalShares == 0 ? 1e8 : totalAssets * 1e8 / totalShares (8 dp)
  { name: "navPerShare", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint32" }], outputs: [{ name: "", type: "uint64" }] },
  { name: "poolCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint32" }] },
  // pools(poolId) → (shareToken, claimNft, totalAssets, totalShares, status)
  {
    name: "pools",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "uint32" }],
    outputs: [
      { name: "shareToken", type: "address" },
      { name: "claimNft", type: "address" },
      { name: "totalAssets", type: "uint64" },
      { name: "totalShares", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  { name: "shareBalanceOf", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint32" }, { name: "account", type: "address" }], outputs: [{ name: "", type: "uint64" }] },
  { name: "previewDeposit", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint32" }, { name: "assetsTinybar", type: "uint64" }], outputs: [{ name: "", type: "uint64" }] },
  { name: "previewRedeem", type: "function", stateMutability: "view", inputs: [{ name: "poolId", type: "uint32" }, { name: "shares", type: "uint64" }], outputs: [{ name: "", type: "uint64" }] },

  // ---- Writes ----
  // deposit(poolId) PAYABLE → shares minted (8 dp). Attach native HBAR as
  // msg.value (weibar). Caller must have associated the share token (IHRC719)
  // first; no allowance/approve step (settlement is native HBAR).
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [{ name: "poolId", type: "uint32" }], outputs: [{ name: "sharesMinted", type: "uint64" }] },
  // redeem(poolId, shares) → HBAR (tinybar) returned at NAV.
  { name: "redeem", type: "function", stateMutability: "nonpayable", inputs: [{ name: "poolId", type: "uint32" }, { name: "shares", type: "uint64" }], outputs: [{ name: "assetsTinybar", type: "uint64" }] },

  // ---- Events (read by the Activity feed via Mirror Node) ----
  { type: "event", name: "Deposit", inputs: [
    { name: "poolId", type: "uint32", indexed: true },
    { name: "investor", type: "address", indexed: true },
    { name: "assetsTinybar", type: "uint64", indexed: false },
    { name: "sharesMinted", type: "uint64", indexed: false },
  ] },
  { type: "event", name: "Redeem", inputs: [
    { name: "poolId", type: "uint32", indexed: true },
    { name: "investor", type: "address", indexed: true },
    { name: "sharesBurned", type: "uint64", indexed: false },
    { name: "assetsTinybar", type: "uint64", indexed: false },
  ] },
  { type: "event", name: "ClaimFinanced", inputs: [
    { name: "claimId", type: "uint256", indexed: true },
    { name: "poolId", type: "uint32", indexed: true },
    { name: "operator", type: "address", indexed: true },
    { name: "principalTinybar", type: "uint64", indexed: false },
    { name: "nftSerial", type: "int64", indexed: false },
  ] },
  { type: "event", name: "RewardRouted", inputs: [
    { name: "poolId", type: "uint32", indexed: true },
    { name: "claimId", type: "uint256", indexed: true },
    { name: "amountTinybar", type: "uint64", indexed: false },
    { name: "navPerShare", type: "uint64", indexed: false },
  ] },
  { type: "event", name: "Default", inputs: [
    { name: "claimId", type: "uint256", indexed: true },
    { name: "poolId", type: "uint32", indexed: true },
    { name: "writedownTinybar", type: "uint64", indexed: false },
    { name: "navPerShare", type: "uint64", indexed: false },
  ] },
];

// HTS ERC-20 facade — every HTS fungible token EVM address answers the standard
// ERC-20 read/write selectors. The vault's redeem() pulls shares from the
// investor (transferToken investor → vault), which needs an HTS allowance, so
// the front calls approve(vault, shares) on the SHARE TOKEN'S OWN EVM address
// before redeeming. balanceOf/allowance are used for reads. (8-dp shares.)
export const HTS_ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

// IHRC719 association facade — every HTS token EVM address exposes these. An
// account must associate a token before it can hold it. Investors associate the
// share token themselves from their wallet via associate().
export const IHRC719_ABI = [
  { name: "associate", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "responseCode", type: "int64" }] },
  { name: "dissociate", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "responseCode", type: "int64" }] },
  { name: "isAssociated", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
];
