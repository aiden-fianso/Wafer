import React, { useEffect, useRef, useState } from "react";
import { MOCK_MODE } from "../lib/config.js";
import {
  formatHbar, formatNav, sanitizeAmountInput, parseUnits8,
  sharesForAssets, assetsForShares, ONE,
} from "../lib/format.js";
import { formatError } from "../lib/errors.js";

// Deposit / Redeem panel.
//
// Deposit:  HBAR → mint shares at NAV.  Preview: shares = assets / navPerShare.
// Redeem:   shares → HBAR at NAV.       Preview: assets = shares * navPerShare.
//
// The deposit action runs the full flow inside contracts.deposit():
//   ensureAssociated(shareToken) → deposit(poolId) PAYABLE (native HBAR msg.value)
// There is no approve step — settlement is native HBAR. Each step is stubbed in
// mock mode but the flow is exercised.
export default function DepositWidget({ pool, contracts, onStatus, refreshKey }) {
  const [tab, setTab] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [hbarBalance, setHbarBalance] = useState(null);
  const [shareBalance, setShareBalance] = useState(null);
  const inFlightRef = useRef(false);

  const nav = pool?.navPerShare ?? ONE;

  useEffect(() => {
    if (!contracts || !pool) return;
    let cancelled = false;
    (async () => {
      try {
        const [hbar, shares] = await Promise.all([
          contracts.getHbarBalance(),
          contracts.getShareBalance(pool.poolId),
        ]);
        if (cancelled) return;
        setHbarBalance(hbar);
        setShareBalance(shares);
      } catch { /* leave previous */ }
    })();
    return () => { cancelled = true; };
  }, [contracts, pool, refreshKey]);

  const amountUnits = parseUnits8(amount);
  const isDeposit = tab === "deposit";
  const balanceUnits = isDeposit ? hbarBalance : shareBalance;
  const balanceLabel = isDeposit ? "HBAR" : "shares";

  // Live preview.
  const previewUnits = isDeposit
    ? sharesForAssets(amountUnits, nav)   // shares minted
    : assetsForShares(amountUnits, nav);  // HBAR returned
  const previewLabel = isDeposit ? "shares" : "HBAR";

  const overBalance = balanceUnits != null && amountUnits > balanceUnits;
  const isDisabled = amountUnits <= 0n || overBalance || isBusy;

  const handleAmountChange = (e) => setAmount(sanitizeAmountInput(e.target.value));
  const handleMax = () => {
    if (balanceUnits == null) return;
    setAmount(formatHbar(balanceUnits).replace(/,/g, ""));
  };

  const handleAction = async () => {
    if (inFlightRef.current || isDisabled) return;
    inFlightRef.current = true;
    setIsBusy(true);
    try {
      if (isDeposit) {
        onStatus("Associating share token + depositing HBAR…");
        await contracts.deposit(pool.poolId, amountUnits, pool.shareToken);
        onStatus("Deposit successful!");
      } else {
        onStatus("Redeeming shares at NAV…");
        await contracts.redeem(pool.poolId, amountUnits);
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
    : amountUnits <= 0n
      ? "Enter an amount"
      : overBalance
        ? "Insufficient balance"
        : isDeposit ? "Deposit HBAR" : "Redeem shares";

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
          <span className="vault-input-title">{isDeposit ? "Deposit HBAR" : "Redeem shares"}</span>
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
          <span className="vault-dollar-value">NAV {formatNav(nav)} HBAR / share</span>
          <div className="vault-balance-row">
            <span className="vault-balance-label">
              {balanceUnits == null ? "—" : formatHbar(balanceUnits)} {balanceLabel}
            </span>
            <button type="button" className="vault-max-btn" onClick={handleMax} disabled={balanceUnits == null}>MAX</button>
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
          <span>Insufficient balance. You have {formatHbar(balanceUnits)} {balanceLabel}.</span>
        </div>
      )}

      <div className="vault-summary">
        <div className="vault-summary-row">
          <span className="vault-summary-label">{isDeposit ? "You deposit" : "You redeem"}</span>
          <span className="vault-summary-value">{formatHbar(amountUnits)} {isDeposit ? "HBAR" : "shares"}</span>
        </div>
        <div className="vault-summary-row">
          <span className="vault-summary-label">{isDeposit ? "Shares minted" : "HBAR returned"} (est.)</span>
          <span className="vault-summary-value vault-apy">{formatHbar(previewUnits)} {previewLabel}</span>
        </div>
        <div className="vault-summary-row">
          <span className="vault-summary-label">NAV / share</span>
          <span className="vault-summary-value">{formatNav(nav)} HBAR</span>
        </div>
        {isDeposit && (
          <div className="vault-summary-row">
            <span className="vault-summary-label">Steps</span>
            <span className="vault-summary-value" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              associate → deposit
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
