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

import { decodeEventLog, getAddress } from "viem";
import { ADDRESSES, MIRROR_NODE_URL, MOCK_ACTIVITY, MOCK_POOLS, MOCK_MODE } from "./config.js";
import { VAULT_ABI } from "./abi.js";

const LOGS_LIMIT = 25;

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

// Aggregate TVL across pools for the landing page hero. In mock mode this sums
// MOCK_POOLS.totalAssets; once live, it can be swapped to read pools() via the
// public client. Returns a Number of whole HBAR. Never throws.
export async function readAggregateStats() {
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
