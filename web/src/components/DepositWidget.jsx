import React, { useEffect, useRef, useState } from "react";
import { MOCK_MODE } from "../lib/config.js";
import {
  formatUsdc, formatNav, sanitizeAmountInput, parseUnits6,
  sharesForAssets, assetsForShares,
} from "../lib/format.js";
import { formatError } from "../lib/errors.js";

// Deposit / Redeem panel.
//
// Deposit:  USDC → mint shares at NAV.  Preview: shares = assets / navPerShare.
// Redeem:   shares → USDC at NAV.       Preview: assets = shares * navPerShare.
//
// The deposit action runs the full SPEC §6 flow inside contracts.deposit():
//   ensureAssociated(shareToken) → approve(vault, usdc) → deposit(poolId, assets)
// Each step is stubbed in mock mode but the flow is exercised.
export default function DepositWidget({ pool, contracts, onStatus, refreshKey }) {
  const [tab, setTab] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [shareBalance, setShareBalance] = useState(null);
  const inFlightRef = useRef(false);

  const nav = pool?.navPerShare ?? 1_000_000n;

  useEffect(() => {
    if (!contracts || !pool) return;
    let cancelled = false;
    (async () => {
      try {
        const [usdc, shares] = await Promise.all([
          contracts.getUsdcBalance(),
          contracts.getShareBalance(pool.poolId),
        ]);
        if (cancelled) return;
        setUsdcBalance(usdc);
        setShareBalance(shares);
      } catch { /* leave previous */ }
    })();
    return () => { cancelled = true; };
  }, [contracts, pool, refreshKey]);

  const amountMicro = parseUnits6(amount);
  const isDeposit = tab === "deposit";
  const balanceMicro = isDeposit ? usdcBalance : shareBalance;
  const balanceLabel = isDeposit ? "USDC" : "shares";

  // Live preview.
  const previewMicro = isDeposit
    ? sharesForAssets(amountMicro, nav)   // shares minted
    : assetsForShares(amountMicro, nav);  // USDC returned
  const previewLabel = isDeposit ? "shares" : "USDC";

  const overBalance = balanceMicro != null && amountMicro > balanceMicro;
  const isDisabled = amountMicro <= 0n || overBalance || isBusy;

  const handleAmountChange = (e) => setAmount(sanitizeAmountInput(e.target.value));
  const handleMax = () => {
    if (balanceMicro == null) return;
    setAmount(formatUsdc(balanceMicro).replace(/,/g, ""));
  };

  const handleAction = async () => {
    if (inFlightRef.current || isDisabled) return;
    inFlightRef.current = true;
    setIsBusy(true);
    try {
      if (isDeposit) {
        onStatus("Associating share token + approving USDC…");
        await contracts.deposit(pool.poolId, amountMicro, pool.shareToken);
        onStatus("Deposit successful!");
      } else {
        onStatus("Redeeming shares at NAV…");
        await contracts.redeem(pool.poolId, amountMicro);
        onStatus("Redeem successful!");
      }
      setAmount("");
    } catch (e) {
      onStatus(formatError(e), true);
    } finally {
      inFlightRef.current = false;
      setIsBusy(false);
    }
  };

  const actionLabel = isBusy
    ? "Processing…"
    : amountMicro <= 0n
      ? "Enter an amount"
      : overBalance
        ? "Insufficient balance"
        : isDeposit ? "Deposit USDC" : "Redeem shares";

  return (
    <div className="vault-panel">
      <div className="vault-tabs">
        <button type="button" className={`vault-tab${isDeposit ? " active" : ""}`} onClick={() => { setTab("deposit"); setAmount(""); }}>
          Deposit
        </button>
        <button type="button" className={`vault-tab${!isDeposit ? " active" : ""}`} onClick={() => { setTab("redeem"); setAmount(""); }}>
          Redeem
        </button>
      </div>

      <div className="vault-input-card">
        <div className="vault-input-header">
          <span className="vault-input-title">{isDeposit ? "Deposit USDC" : "Redeem shares"}</span>
        </div>
        <div className="vault-input-field">
          <input
            aria-label="Amount"
            className="vault-amount-input"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={handleAmountChange}
          />
        </div>
        <div className="vault-input-footer">
          <span className="vault-dollar-value">NAV {formatNav(nav)} USDC / share</span>
          <div className="vault-balance-row">
            <span className="vault-balance-label">
              {balanceMicro == null ? "—" : formatUsdc(balanceMicro)} {balanceLabel}
            </span>
            <button type="button" className="vault-max-btn" onClick={handleMax} disabled={balanceMicro == null}>MAX</button>
          </div>
        </div>
      </div>

      {overBalance && (
        <div className="vault-error-msg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Insufficient balance. You have {formatUsdc(balanceMicro)} {balanceLabel}.</span>
        </div>
      )}

      <div className="vault-summary">
        <div className="vault-summary-row">
          <span className="vault-summary-label">{isDeposit ? "You deposit" : "You redeem"}</span>
          <span className="vault-summary-value">{formatUsdc(amountMicro)} {isDeposit ? "USDC" : "shares"}</span>
        </div>
        <div className="vault-summary-row">
          <span className="vault-summary-label">{isDeposit ? "Shares minted" : "USDC returned"} (est.)</span>
          <span className="vault-summary-value vault-apy">{formatUsdc(previewMicro)} {previewLabel}</span>
        </div>
        <div className="vault-summary-row">
          <span className="vault-summary-label">NAV / share</span>
          <span className="vault-summary-value">{formatNav(nav)} USDC</span>
        </div>
        {isDeposit && (
          <div className="vault-summary-row">
            <span className="vault-summary-label">Steps</span>
            <span className="vault-summary-value" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              associate → approve → deposit
            </span>
          </div>
        )}
      </div>

      <button
        className="vault-action-btn"
        disabled={isDisabled}
        onClick={handleAction}
        type="button"
        aria-label={`${actionLabel} in ${pool?.name}`}
      >
        {actionLabel}
      </button>

      {MOCK_MODE && (
        <p className="text-muted" style={{ marginTop: "0.75rem", fontSize: "0.75rem", textAlign: "center", opacity: 0.6 }}>
          Demo mode — transactions are stubbed until WaferVault is deployed.
        </p>
      )}
    </div>
  );
}
