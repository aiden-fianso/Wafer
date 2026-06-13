import { useCallback, useMemo } from "react";
import { getContract } from "viem";
import { VAULT_ABI, ERC20_ABI, IHRC719_ABI } from "../lib/abi.js";
import { ADDRESSES, MOCK_MODE, MOCK_POOLS } from "../lib/config.js";
import { navPerShare as computeNav, sharesForAssets } from "../lib/format.js";

// Gas tuning. The Hedera testnet (Hashio) relay underestimates maxFeePerGas:
// it caches a baseFee a few blocks back and rejects with "max fee per gas less
// than block base fee". We read the live
// baseFee and pad it 5x + a small priority tip. Over-paying costs a fraction of
// a cent; under-paying blocks the tx entirely.
const GAS_BASEFEE_MULTIPLIER = 5n;
const GAS_PRIORITY_FEE_WEI = 100_000_000n; // 0.1 gwei

// HTS-touching calls (deposit/redeem/approve/associate) need a pinned gasLimit
// because Hashio mis-estimates precompile calls (SPEC §6, §11). ~1M is the
// documented floor for HTS transfer/mint/burn paths.
const HTS_GAS_LIMIT = 1_000_000n;

export function useContracts(walletClient, publicClient, account) {
  // ---- viem contract wrappers ----
  const vaultContract = useCallback((readonly = false) => {
    if (!publicClient) return null;
    if (!readonly && !walletClient) return null;
    return getContract({
      address: ADDRESSES.vault,
      abi: VAULT_ABI,
      client: readonly ? { public: publicClient } : { public: publicClient, wallet: walletClient },
    });
  }, [walletClient, publicClient]);

  const erc20Contract = useCallback((addr, readonly = false) => {
    if (!publicClient) return null;
    if (!readonly && !walletClient) return null;
    return getContract({
      address: addr,
      abi: ERC20_ABI,
      client: readonly ? { public: publicClient } : { public: publicClient, wallet: walletClient },
    });
  }, [walletClient, publicClient]);

  // IHRC719 association facade lives at the token's own EVM address.
  const hrc719Contract = useCallback((tokenAddr) => {
    if (!walletClient || !publicClient) return null;
    return getContract({
      address: tokenAddr,
      abi: IHRC719_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
  }, [walletClient, publicClient]);

  // ---- gas + tx helpers ----
  const getGasOverrides = useCallback(async (gasLimit) => {
    const overrides = {};
    if (gasLimit) overrides.gas = gasLimit;
    if (!publicClient) return overrides;
    try {
      let baseFee;
      try {
        const block = await publicClient.getBlock({ blockTag: "latest" });
        baseFee = block?.baseFeePerGas;
      } catch {}
      if (!baseFee || baseFee === 0n) {
        try { baseFee = await publicClient.getGasPrice(); } catch {}
      }
      if (baseFee && baseFee > 0n) {
        overrides.maxPriorityFeePerGas = GAS_PRIORITY_FEE_WEI;
        overrides.maxFeePerGas = baseFee * GAS_BASEFEE_MULTIPLIER + GAS_PRIORITY_FEE_WEI;
      }
    } catch {
      // Fall through with whatever overrides we have (possibly just gas).
    }
    return overrides;
  }, [publicClient]);

  // Throw on revert — viem's waitForTransactionReceipt resolves with a receipt
  // regardless of execution status. Re-simulate on revert to surface the
  // on-chain reason (HTS SUCCESS-check reverts, allowance, association, etc.).
  const waitTx = useCallback(async (hash, simContext) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") return receipt;
    let detail = "";
    if (simContext) {
      try {
        await publicClient.simulateContract({ ...simContext, account });
      } catch (simErr) {
        const reason = simErr?.shortMessage ?? simErr?.cause?.shortMessage ?? simErr?.message?.split("\n")[0] ?? "";
        if (reason) detail = ` — ${reason.slice(0, 200)}`;
      }
    }
    throw new Error(`Transaction reverted on-chain (tx ${hash.slice(0, 10)}…)${detail}`);
  }, [publicClient, account]);

  // Defensive: viem's writeContract uses walletClient.account cached at
  // construction; if MetaMask switched accounts after our client was built, the
  // two diverge. Hard-fail with a clear message instead of sending a tx from
  // the wrong account.
  const assertAccountSync = useCallback(async () => {
    if (!account || typeof window === "undefined" || !window.ethereum) return;
    try {
      const live = (await window.ethereum.request({ method: "eth_accounts" }))?.[0];
      if (live && live.toLowerCase() !== account.toLowerCase()) {
        throw new Error("MetaMask account changed since this page loaded. Refresh and reconnect to the account you want to use.");
      }
    } catch (e) {
      if (e?.message?.startsWith("MetaMask account")) throw e;
    }
  }, [account]);

  // ---- POOL READS ----

  // List pools with NAV/TVL. In mock mode, returns MOCK_POOLS. Once live, reads
  // poolCount() + pools(i) + navPerShare(i) from the contract.
  const getPools = useCallback(async () => {
    if (MOCK_MODE) return MOCK_POOLS.map((p) => ({ ...p }));
    const vault = vaultContract(true);
    if (!vault) return [];
    try {
      const count = Number(await vault.read.poolCount());
      const ids = Array.from({ length: count }, (_, i) => i);
      return await Promise.all(ids.map(async (poolId) => {
        const [pool, nav] = await Promise.all([
          vault.read.pools([BigInt(poolId)]),
          vault.read.navPerShare([BigInt(poolId)]),
        ]);
        const [shareToken, totalShares, totalAssets, status] = pool;
        // Decorate with display metadata from MOCK_POOLS if a label exists for
        // this index (network/risk aren't on-chain).
        const meta = MOCK_POOLS[poolId] || {};
        return {
          poolId,
          name: meta.name ?? `POOL-${poolId}`,
          network: meta.network ?? "—",
          risk: meta.risk ?? "—",
          networkLogo: meta.networkLogo ?? "/logos/hedera.svg",
          shareToken,
          totalShares,
          totalAssets,
          navPerShare: nav,
          status: Number(status),
        };
      }));
    } catch {
      return MOCK_POOLS.map((p) => ({ ...p }));
    }
  }, [vaultContract]);

  // NAV per share (6 dp) for a single pool.
  const getNavPerShare = useCallback(async (poolId) => {
    if (MOCK_MODE) {
      const p = MOCK_POOLS[poolId];
      return p ? p.navPerShare : 1_000_000n;
    }
    const vault = vaultContract(true);
    if (!vault) return 1_000_000n;
    try {
      return await vault.read.navPerShare([BigInt(poolId)]);
    } catch {
      return 1_000_000n;
    }
  }, [vaultContract]);

  // The connected wallet's share balance (6 dp) for a pool.
  const getShareBalance = useCallback(async (poolId) => {
    if (!account) return null;
    if (MOCK_MODE) return 0n; // no on-chain position in mock mode
    const vault = vaultContract(true);
    if (!vault) return null;
    try {
      return await vault.read.shareBalanceOf([BigInt(poolId), account]);
    } catch {
      return null;
    }
  }, [vaultContract, account]);

  // The connected wallet's USDC balance (6 dp).
  const getUsdcBalance = useCallback(async () => {
    if (!account) return null;
    if (MOCK_MODE) return null;
    const usdc = erc20Contract(ADDRESSES.usdc, true);
    if (!usdc) return null;
    try {
      return await usdc.read.balanceOf([account]);
    } catch {
      return null;
    }
  }, [erc20Contract, account]);

  // ---- ASSOCIATION + APPROVAL (deposit/redeem prerequisites, SPEC §4/§6) ----

  // Ensure the account is associated with an HTS token (via the IHRC719 facade
  // at the token's EVM address). No-op if already associated. Stubbed in mock
  // mode (no contract to call), but the flow is built.
  const ensureAssociated = useCallback(async (tokenAddr) => {
    if (MOCK_MODE) return; // contract not deployed — flow is a no-op stub
    if (!tokenAddr || tokenAddr === "0x0000000000000000000000000000000000000000") return;
    await assertAccountSync();
    const token = hrc719Contract(tokenAddr);
    if (!token) throw new Error("Wallet not connected — please connect first.");
    try {
      const already = await token.read.isAssociated();
      if (already) return;
    } catch {
      // isAssociated may not be exposed on every facade build — fall through and
      // attempt associate(); it reverts harmlessly if already associated.
    }
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const hash = await token.write.associate(overrides);
    await waitTx(hash, { address: tokenAddr, abi: IHRC719_ABI, functionName: "associate", args: [] });
  }, [hrc719Contract, getGasOverrides, waitTx, assertAccountSync]);

  // Approve the vault to pull `assets` (6 dp) of USDC. Skips if allowance is
  // already sufficient. Stubbed in mock mode.
  const approveUsdc = useCallback(async (assets) => {
    if (MOCK_MODE) return;
    await assertAccountSync();
    const usdc = erc20Contract(ADDRESSES.usdc);
    if (!usdc) throw new Error("Wallet not connected — please connect first.");
    const amount = BigInt(assets);
    try {
      const current = await usdc.read.allowance([account, ADDRESSES.vault]);
      if (current >= amount) return;
    } catch {
      // Read failed — proceed to approve defensively.
    }
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const args = [ADDRESSES.vault, amount];
    const hash = await usdc.write.approve(args, overrides);
    await waitTx(hash, { address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: "approve", args });
  }, [erc20Contract, getGasOverrides, waitTx, assertAccountSync, account]);

  // ---- DEPOSIT / REDEEM ----

  // Full deposit flow (SPEC §6): ensureAssociated(share) → approve(vault, usdc)
  // → deposit(poolId, assets). shareToken is the pool's share token EVM address
  // (from getPools()[poolId].shareToken). In mock mode every step is a stub so
  // the UI flow is exercised end-to-end without a deployed contract.
  const deposit = useCallback(async (poolId, assets, shareToken) => {
    if (MOCK_MODE) {
      // Simulate latency so the UI shows its busy/processing states.
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    await assertAccountSync();
    const amount = BigInt(assets);
    if (amount <= 0n) throw new Error("Amount must be greater than 0.");
    if (shareToken) await ensureAssociated(shareToken);
    await approveUsdc(amount);
    const vault = vaultContract();
    if (!vault) throw new Error("Wallet not connected — please connect first.");
    const args = [BigInt(poolId), amount];
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const hash = await vault.write.deposit(args, overrides);
    await waitTx(hash, { address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "deposit", args });
  }, [vaultContract, ensureAssociated, approveUsdc, getGasOverrides, waitTx, assertAccountSync]);

  // Redeem shares → USDC at NAV. Redeem-at-NAV is the guaranteed exit (SPEC §5).
  const redeem = useCallback(async (poolId, shares) => {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    await assertAccountSync();
    const amount = BigInt(shares);
    if (amount <= 0n) throw new Error("Amount must be greater than 0.");
    const vault = vaultContract();
    if (!vault) throw new Error("Wallet not connected — please connect first.");
    const args = [BigInt(poolId), amount];
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const hash = await vault.write.redeem(args, overrides);
    await waitTx(hash, { address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "redeem", args });
  }, [vaultContract, getGasOverrides, waitTx, assertAccountSync]);

  // Deposit preview: shares = assets / navPerShare (all 6-dp).
  const previewDeposit = useCallback((assets, nav) => sharesForAssets(assets, nav), []);

  // Local NAV recompute helper (mirror of the on-chain view) for display.
  const localNav = useCallback((totalAssets, totalShares) => computeNav(totalAssets, totalShares), []);

  return useMemo(() => ({
    getPools,
    getNavPerShare,
    getShareBalance,
    getUsdcBalance,
    ensureAssociated,
    approveUsdc,
    deposit,
    redeem,
    previewDeposit,
    localNav,
  }), [
    getPools, getNavPerShare, getShareBalance, getUsdcBalance,
    ensureAssociated, approveUsdc, deposit, redeem, previewDeposit, localNav,
  ]);
}
