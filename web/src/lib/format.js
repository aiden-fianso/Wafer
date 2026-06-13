// Display + money helpers for Wafer.
//
// Money rule: USDC and pool shares are 6-decimal integer micro-units (bigint)
// end-to-end. Only convert to a human string at the display edge — these
// helpers ARE that edge. NAV per share is also 6-dp (micro-USDC per share).

const MISSING = "---";
export const DECIMALS = 6;
export const ONE = 1_000_000n; // 1.000000 in 6-dp micro-units

// Format a 6-dp micro-unit bigint as a human number string (e.g. 1042000n →
// "1.042000", trimmed to `maxFractionDigits`). Accepts bigint | number | null.
export function formatUnits6(micro, maxFractionDigits = 2) {
  if (micro === null || micro === undefined) return MISSING;
  let v;
  try {
    v = typeof micro === "bigint" ? micro : BigInt(micro);
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

// Convenience: format as a USDC amount (6 dp → "1,234.56").
export function formatUsdc(micro) {
  return formatUnits6(micro, 2);
}

// Format NAV per share with more precision (6 dp → "1.0420").
export function formatNav(micro) {
  return formatUnits6(micro, 4);
}

export function formatPercent(ratio, digits = 2) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return MISSING;
  return `${(ratio * 100).toFixed(digits)}%`;
}

// Parse a human decimal string ("12.5") into 6-dp micro-units (bigint).
// Returns 0n for empty/invalid input.
export function parseUnits6(value) {
  if (value === null || value === undefined) return 0n;
  const s = String(value).trim();
  if (!s) return 0n;
  const [whole = "0", frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, DECIMALS);
  try {
    const w = BigInt(whole.replace(/[^0-9]/g, "") || "0");
    const f = BigInt(fracPadded.replace(/[^0-9]/g, "") || "0");
    return w * ONE + f;
  } catch {
    return 0n;
  }
}

// shares = assets * 1e6 / navPerShare   (deposit preview, SPEC §6)
// Both assets and navPerShare are 6-dp micro-units; result is 6-dp shares.
export function sharesForAssets(assetsMicro, navPerShareMicro) {
  if (assetsMicro == null || navPerShareMicro == null) return null;
  const a = BigInt(assetsMicro);
  const nav = BigInt(navPerShareMicro);
  if (nav <= 0n) return 0n;
  return (a * ONE) / nav;
}

// assets = shares * navPerShare / 1e6   (redeem preview, SPEC §6)
export function assetsForShares(sharesMicro, navPerShareMicro) {
  if (sharesMicro == null || navPerShareMicro == null) return null;
  const s = BigInt(sharesMicro);
  const nav = BigInt(navPerShareMicro);
  return (s * nav) / ONE;
}

// navPerShare = totalShares == 0 ? 1e6 : totalAssets * 1e6 / totalShares (6 dp)
export function navPerShare(totalAssetsMicro, totalSharesMicro) {
  const ts = BigInt(totalSharesMicro ?? 0n);
  if (ts === 0n) return ONE;
  const ta = BigInt(totalAssetsMicro ?? 0n);
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
