// Display + money helpers for Wafer.
//
// Money rule: HBAR and pool shares are 8-decimal integer units (tinybar / share
// micro-units, bigint) end-to-end — matching the WaferVault contract (ONE = 1e8,
// 1 HBAR = 1e8 tinybar). Only convert to a human string at the display edge —
// these helpers ARE that edge. NAV per share is also 8-dp (tinybar per share).
// The EVM weibar boundary (18 dp for msg.value / native balance) is handled in
// useContracts.js, never here.

const MISSING = "---";
export const DECIMALS = 8;
export const ONE = 100_000_000n; // 1.00000000 in 8-dp units (1 HBAR = 1e8 tinybar)

// Format an 8-dp unit bigint as a human number string (e.g. 104200000n →
// "1.042", trimmed to `maxFractionDigits`). Accepts bigint | number | null.
export function formatUnits8(units, maxFractionDigits = 2) {
  if (units === null || units === undefined) return MISSING;
  let v;
  try {
    v = typeof units === "bigint" ? units : BigInt(units);
  } catch {
    return MISSING;
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / ONE;
  const frac = v % ONE;
  const wholeStr = whole.toLocaleString("en-US");
  let fracStr = frac.toString().padStart(DECIMALS, "0");
  fracStr = fracStr.slice(0, Math.max(0, Math.min(DECIMALS, maxFractionDigits)));
  // Trim trailing zeros but keep at least 2 dp for currency-style display.
  fracStr = fracStr.replace(/0+$/, "");
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, "0");
  const out = fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
  return neg ? `-${out}` : out;
}

// Convenience: format as an HBAR amount (8 dp → "1,234.56").
export function formatHbar(units) {
  return formatUnits8(units, 2);
}

// Format NAV per share with more precision (8 dp → "1.0420").
export function formatNav(units) {
  return formatUnits8(units, 4);
}

export function formatPercent(ratio, digits = 2) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return MISSING;
  return `${(ratio * 100).toFixed(digits)}%`;
}

// Parse a human decimal string ("12.5") into 8-dp units (tinybar, bigint).
// Returns 0n for empty/invalid input.
export function parseUnits8(value) {
  if (value === null || value === undefined) return 0n;
  const s = String(value).trim();
  if (!s) return 0n;
  const [whole = "0", frac = ""] = s.split(".");
  const fracPadded = (frac + "00000000").slice(0, DECIMALS);
  try {
    const w = BigInt(whole.replace(/[^0-9]/g, "") || "0");
    const f = BigInt(fracPadded.replace(/[^0-9]/g, "") || "0");
    return w * ONE + f;
  } catch {
    return 0n;
  }
}

// shares = assets * 1e8 / navPerShare   (deposit preview)
// Both assets and navPerShare are 8-dp units; result is 8-dp shares.
export function sharesForAssets(assetsUnits, navPerShareUnits) {
  if (assetsUnits == null || navPerShareUnits == null) return null;
  const a = BigInt(assetsUnits);
  const nav = BigInt(navPerShareUnits);
  if (nav <= 0n) return 0n;
  return (a * ONE) / nav;
}

// assets = shares * navPerShare / 1e8   (redeem preview)
export function assetsForShares(sharesUnits, navPerShareUnits) {
  if (sharesUnits == null || navPerShareUnits == null) return null;
  const s = BigInt(sharesUnits);
  const nav = BigInt(navPerShareUnits);
  return (s * nav) / ONE;
}

// navPerShare = totalShares == 0 ? 1e8 : totalAssets * 1e8 / totalShares (8 dp)
export function navPerShare(totalAssetsUnits, totalSharesUnits) {
  const ts = BigInt(totalSharesUnits ?? 0n);
  if (ts === 0n) return ONE;
  const ta = BigInt(totalAssetsUnits ?? 0n);
  return (ta * ONE) / ts;
}

// Restrict free-form input: digits + at most one dot, bounded decimals.
export function sanitizeAmountInput(raw, maxDecimals = DECIMALS) {
  if (!raw) return "";
  const onlyAllowed = String(raw).replace(/[^0-9.]/g, "");
  const firstDot = onlyAllowed.indexOf(".");
  let s;
  if (firstDot === -1) {
    s = onlyAllowed;
  } else {
    const intPart = onlyAllowed.slice(0, firstDot);
    const fracPart = onlyAllowed.slice(firstDot + 1).replace(/\./g, "").slice(0, maxDecimals);
    s = intPart + "." + fracPart;
  }
  if (/^0\d/.test(s)) s = s.replace(/^0+/, "0");
  return s;
}

// Short address for display.
export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

// Human "x ago" from an age in seconds.
export function timeAgo(seconds) {
  if (seconds == null) return MISSING;
  const s = Number(seconds);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
