// Hedera Mirror Node REST reads — the audit/read layer for Wafer (SPEC §6).
//
// The activity feed reads contract event logs from
//   {MIRROR}/api/v1/contracts/{idOrEvmAddress}/results/logs
// and decodes them against the WaferVault event ABIs. Token supply/holders and
// account balances also come from the Mirror Node, but only the logs reader is
// wired here for the activity screen; extend as screens need more.
//
// Until the contract is deployed (MOCK_MODE), these helpers return placeholder
// data so the UI renders. Nothing here throws — read failures degrade to mocks.

import { decodeEventLog, getAddress, createPublicClient, http } from "viem";
import { ADDRESSES, MIRROR_NODE_URL, RPC_URL, MOCK_ACTIVITY, MOCK_POOLS, MOCK_MODE } from "./config.js";
import { VAULT_ABI } from "./abi.js";

const LOGS_LIMIT = 25;

// Wallet-free read-only client over the Hedera EVM relay, so mirror helpers can
// read the contract before the user connects a wallet (landing page hero).
let _readClient = null;
function readClient() {
  if (MOCK_MODE) return null;
  if (!_readClient) {
    _readClient = createPublicClient({ transport: http(RPC_URL, { retryCount: 2 }) });
  }
  return _readClient;
}

// Map a decoded event to the normalized shape the Activity screen renders.
function normalizeEvent(decoded, log) {
  const { eventName, args } = decoded;
  const blockTimestamp = log?.timestamp ? Number(log.timestamp.split(".")[0]) : null;
  const ageSeconds = blockTimestamp ? Math.max(0, Math.floor(Date.now() / 1000) - blockTimestamp) : null;
  const base = { type: eventName, ageSeconds, txHash: log?.transaction_hash ?? null };
  switch (eventName) {
    case "Deposit":
      return { ...base, poolId: Number(args.poolId), account: args.investor, assets: args.assetsTinybar, shares: args.sharesMinted };
    case "Redeem":
      return { ...base, poolId: Number(args.poolId), account: args.investor, shares: args.sharesBurned, assets: args.assetsTinybar };
    case "ClaimFinanced":
      return { ...base, poolId: Number(args.poolId), claimId: Number(args.claimId), account: args.operator, assets: args.principalTinybar };
    case "RewardRouted":
      return { ...base, poolId: Number(args.poolId), claimId: Number(args.claimId), assets: args.amountTinybar };
    case "Default":
      return { ...base, poolId: Number(args.poolId), claimId: Number(args.claimId), assets: args.writedownTinybar };
    default:
      return base;
  }
}

// Fetch + decode the vault's recent events. Returns a normalized array, newest
// first. Falls back to MOCK_ACTIVITY in mock mode or on any failure.
export async function readActivity() {
  if (MOCK_MODE) return MOCK_ACTIVITY;
  try {
    const url = `${MIRROR_NODE_URL}/api/v1/contracts/${ADDRESSES.vault}/results/logs?order=desc&limit=${LOGS_LIMIT}`;
    const r = await fetch(url);
    if (!r.ok) return MOCK_ACTIVITY;
    const data = await r.json();
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    const out = [];
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: VAULT_ABI,
          data: log.data,
          topics: log.topics,
        });
        out.push(normalizeEvent(decoded, log));
      } catch {
        // Unknown / non-Wafer log — skip.
      }
    }
    return out.length ? out : MOCK_ACTIVITY;
  } catch {
    return MOCK_ACTIVITY;
  }
}

// Read an HTS token's metadata (supply, decimals, name) from the Mirror Node.
// Used to show a pool share-token's circulating supply alongside the contract's
// totalShares cache. Returns null on any failure (never throws). `total_supply`
// is the raw 8-dp integer string; we return it as a bigint.
export async function readTokenSupply(tokenIdOrAddr) {
  if (MOCK_MODE || !tokenIdOrAddr) return null;
  try {
    const url = `${MIRROR_NODE_URL}/api/v1/tokens/${tokenIdOrAddr}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return {
      tokenId: data?.token_id ?? null,
      name: data?.name ?? null,
      symbol: data?.symbol ?? null,
      decimals: data?.decimals != null ? Number(data.decimals) : null,
      totalSupply: data?.total_supply != null ? BigInt(data.total_supply) : null,
    };
  } catch {
    return null;
  }
}

// Count the holders of an HTS token via the Mirror Node balances endpoint
// (accounts with balance > 0). Best-effort, single page; returns null on
// failure. Useful as a "N investors" stat on the pool / dashboard screens.
export async function readTokenHolders(tokenIdOrAddr) {
  if (MOCK_MODE || !tokenIdOrAddr) return null;
  try {
    const url = `${MIRROR_NODE_URL}/api/v1/tokens/${tokenIdOrAddr}/balances?order=desc&limit=100`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const balances = Array.isArray(data?.balances) ? data.balances : [];
    return balances.filter((b) => BigInt(b?.balance ?? 0) > 0n).length;
  } catch {
    return null;
  }
}

// Aggregate TVL across pools for the landing page hero. In mock mode this sums
// MOCK_POOLS.totalAssets; once live, it sums pools(i).totalAssets read from the
// contract through a wallet-free read client (works before the user connects).
// Returns a Number of whole HBAR. Never throws.
export async function readAggregateStats() {
  const client = readClient();
  if (client) {
    try {
      const count = Number(await client.readContract({
        address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "poolCount",
      }));
      let totalAssets = 0n;
      let totalShares = 0n;
      for (let i = 0; i < count; i++) {
        const pool = await client.readContract({
          address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "pools", args: [i],
        });
        // pools() → (shareToken, claimNft, totalAssets, totalShares, status)
        totalAssets += BigInt(pool[2]);
        totalShares += BigInt(pool[3]);
      }
      return {
        tvl: Number(totalAssets / 100_000_000n),
        shares: Number(totalShares / 100_000_000n),
        ok: true,
      };
    } catch {
      // fall through to mock aggregate below
    }
  }
  try {
    const totalAssets = MOCK_POOLS.reduce((acc, p) => acc + p.totalAssets, 0n);
    const totalShares = MOCK_POOLS.reduce((acc, p) => acc + p.totalShares, 0n);
    return {
      tvl: Number(totalAssets / 100_000_000n),
      shares: Number(totalShares / 100_000_000n),
      ok: true,
    };
  } catch {
    return { tvl: 0, shares: 0, ok: false };
  }
}

// Normalize an EVM address for HashScan account links, tolerating shorthand.
export function toChecksum(addr) {
  try {
    return getAddress(addr);
  } catch {
    return addr;
  }
}
