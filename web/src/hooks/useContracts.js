import { useCallback, useMemo } from "react";
import { getContract } from "viem";
import { VAULT_ABI, IHRC719_ABI, HTS_ERC20_ABI } from "../lib/abi.js";
import { ADDRESSES, MOCK_MODE, MOCK_POOLS } from "../lib/config.js";
import { navPerShare as computeNav, sharesForAssets, ONE } from "../lib/format.js";

// Gas tuning. The Hedera testnet (Hashio) relay underestimates maxFeePerGas:
// it caches a baseFee a few blocks back and rejects with "max fee per gas less
// than block base fee". We read the live
// baseFee and pad it 5x + a small priority tip. Over-paying costs a fraction of
// a cent; under-paying blocks the tx entirely.
const GAS_BASEFEE_MULTIPLIER = 5n;
const GAS_PRIORITY_FEE_WEI = 100_000_000n; // 0.1 gwei

// HTS-touching calls (deposit/redeem/associate) need a pinned gasLimit because
// Hashio mis-estimates precompile calls. ~1M is the documented floor for HTS
// transfer/mint/burn paths.
const HTS_GAS_LIMIT = 1_000_000n;

// EVM <-> Hedera HBAR conversion: the contract accounts in tinybar (8 dp) but
// msg.value / eth_getBalance are in weibar (18 dp). 1 tinybar = 1e10 weibar.
const WEIBAR_PER_TINYBAR = 10_000_000_000n;

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

  // IHRC719 association facade lives at the token's own EVM address.
  const hrc719Contract = useCallback((tokenAddr) => {
    if (!walletClient || !publicClient) return null;
    return getContract({
      address: tokenAddr,
      abi: IHRC719_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
  }, [walletClient, publicClient]);

  // HTS ERC-20 facade — also at the token's own EVM address. Used for the
  // approve/allowance the vault's redeem() needs to pull shares.
  const htsErc20Contract = useCallback((tokenAddr, readonly = false) => {
    if (!publicClient) return null;
    if (!readonly && !walletClient) return null;
    return getContract({
      address: tokenAddr,
      abi: HTS_ERC20_ABI,
      client: readonly ? { public: publicClient } : { public: publicClient, wallet: walletClient },
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
  // on-chain reason (HTS SUCCESS-check reverts, association, etc.).
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
        // pools() → (shareToken, claimNft, totalAssets, totalShares, status)
        const [shareToken, , totalAssets, totalShares, status] = pool;
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

  // NAV per share (8 dp) for a single pool.
  const getNavPerShare = useCallback(async (poolId) => {
    if (MOCK_MODE) {
      const p = MOCK_POOLS[poolId];
      return p ? p.navPerShare : ONE;
    }
    const vault = vaultContract(true);
    if (!vault) return ONE;
    try {
      return await vault.read.navPerShare([BigInt(poolId)]);
    } catch {
      return ONE;
    }
  }, [vaultContract]);

  // The connected wallet's share balance (8 dp) for a pool.
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

  // The connected wallet's native HBAR balance, normalized to 8-dp tinybar so it
  // formats with the same helpers as shares/NAV. eth_getBalance returns weibar
  // (18 dp); tinybar = weibar / 1e10.
  const getHbarBalance = useCallback(async () => {
    if (!account || !publicClient) return null;
    try {
      const weibar = await publicClient.getBalance({ address: account });
      return weibar / WEIBAR_PER_TINYBAR;
    } catch {
      return null;
    }
  }, [publicClient, account]);

  // ---- ASSOCIATION (deposit prerequisite) ----

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

  // ---- SHARE ALLOWANCE (redeem prerequisite) ----

  // Ensure the vault has an HTS allowance to pull `shares` from the investor on
  // the share token. redeem() does transferToken(share, investor → vault), which
  // requires the investor to have approve()'d the vault first. We approve via the
  // share token's ERC-20 facade. No-op if the standing allowance already covers
  // the amount. Gas is pinned (HTS precompile path).
  const ensureShareAllowance = useCallback(async (shareToken, shares) => {
    if (MOCK_MODE) return;
    if (!shareToken || shareToken === "0x0000000000000000000000000000000000000000") {
      throw new Error("Share token address unavailable — reload the pool and retry.");
    }
    await assertAccountSync();
    const tokenRead = htsErc20Contract(shareToken, true);
    const amount = BigInt(shares);
    try {
      const current = await tokenRead.read.allowance([account, ADDRESSES.vault]);
      if (BigInt(current) >= amount) return; // standing allowance already covers it
    } catch {
      // allowance read may not be exposed on every facade build — fall through and approve.
    }
    const token = htsErc20Contract(shareToken);
    if (!token) throw new Error("Wallet not connected — please connect first.");
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const hash = await token.write.approve([ADDRESSES.vault, amount], overrides);
    await waitTx(hash, { address: shareToken, abi: HTS_ERC20_ABI, functionName: "approve", args: [ADDRESSES.vault, amount] });
  }, [htsErc20Contract, getGasOverrides, waitTx, assertAccountSync, account]);

  // ---- DEPOSIT / REDEEM ----

  // Full deposit flow: ensureAssociated(share) → deposit(poolId) PAYABLE with
  // native HBAR as msg.value. `assets` is 8-dp tinybar; msg.value is weibar
  // (tinybar × 1e10). There is no approve step — settlement is native HBAR.
  // shareToken is the pool's share token EVM address (getPools()[poolId].shareToken).
  // In mock mode every step is a stub so the UI flow runs without a contract.
  const deposit = useCallback(async (poolId, assets, shareToken) => {
    if (MOCK_MODE) {
      // Simulate latency so the UI shows its busy/processing states.
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    await assertAccountSync();
    const tinybar = BigInt(assets);
    if (tinybar <= 0n) throw new Error("Amount must be greater than 0.");
    if (shareToken) await ensureAssociated(shareToken);
    const vault = vaultContract();
    if (!vault) throw new Error("Wallet not connected — please connect first.");
    const value = tinybar * WEIBAR_PER_TINYBAR;
    const args = [BigInt(poolId)];
    const overrides = { ...(await getGasOverrides(HTS_GAS_LIMIT)), value };
    const hash = await vault.write.deposit(args, overrides);
    await waitTx(hash, { address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "deposit", args, value });
  }, [vaultContract, ensureAssociated, getGasOverrides, waitTx, assertAccountSync]);

  // Redeem shares → native HBAR at NAV. Redeem-at-NAV is the guaranteed exit.
  // The vault pulls shares from the investor, so we approve the vault on the
  // share token (HTS allowance) first, then call redeem(poolId, shares).
  // `shareToken` is the pool's share token EVM address (getPools()[poolId].shareToken).
  const redeem = useCallback(async (poolId, shares, shareToken) => {
    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    await assertAccountSync();
    const amount = BigInt(shares);
    if (amount <= 0n) throw new Error("Amount must be greater than 0.");
    const vault = vaultContract();
    if (!vault) throw new Error("Wallet not connected — please connect first.");
    const token = shareToken || ADDRESSES.shareToken;
    await ensureShareAllowance(token, amount);
    const args = [BigInt(poolId), amount];
    const overrides = await getGasOverrides(HTS_GAS_LIMIT);
    const hash = await vault.write.redeem(args, overrides);
    await waitTx(hash, { address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "redeem", args });
  }, [vaultContract, ensureShareAllowance, getGasOverrides, waitTx, assertAccountSync]);

  // Deposit preview: shares = assets / navPerShare (all 8-dp).
  const previewDeposit = useCallback((assets, nav) => sharesForAssets(assets, nav), []);

  // Local NAV recompute helper (mirror of the on-chain view) for display.
  const localNav = useCallback((totalAssets, totalShares) => computeNav(totalAssets, totalShares), []);

  return useMemo(() => ({
    getPools,
    getNavPerShare,
    getShareBalance,
    getHbarBalance,
    ensureAssociated,
    ensureShareAllowance,
    deposit,
    redeem,
    previewDeposit,
    localNav,
  }), [
    getPools, getNavPerShare, getShareBalance, getHbarBalance,
    ensureAssociated, ensureShareAllowance, deposit, redeem, previewDeposit, localNav,
  ]);
}
