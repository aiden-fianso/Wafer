import { expect } from "chai";

/**
 * Pure-logic NAV / unit tests for WaferVault (contracts/WaferVault.sol).
 *
 * These reproduce the on-chain integer arithmetic *exactly* (BigInt, truncating division) so we
 * can pin the NAV round-trip + the HBAR unit model without touching the 0x167 precompile (which a
 * Hardhat local network can't model — the HTS-touching paths are exercised by `pnpm run smoke`
 * live on testnet). The contract is the source of truth; change the math there, change it here.
 *
 * UNITS — measured live on testnet, not assumed (a probe contract proved it).
 *   The Hedera EVM is TINYBAR-internal: a wallet/relay attaches value in WEIBAR (1 HBAR = 1e18),
 *   but by the time the contract runs the relay has converted to TINYBAR (1 HBAR = 1e8). So inside
 *   the contract `msg.value`, `address(this).balance`, and `call{value:}` are ALL tinybar, and the
 *   vault accounts natively in tinybar with NO conversion. Shares are 8-dp; ONE = 1e8.
 */

const ONE = 100_000_000n; // 1e8 — 1.0 in tinybar / share micro-units (8 dp)
const WEIBAR_PER_TINYBAR = 10_000_000_000n; // 1e10 — the relay's RPC-boundary mapping
const HBAR = 100_000_000n; // 1 HBAR in tinybar
const WEIBAR = 1_000_000_000_000_000_000n; // 1 HBAR in weibar (RPC boundary only)

interface PoolState {
  totalAssets: bigint; // tinybar
  totalShares: bigint; // share micro-units (8 dp)
}
const empty: PoolState = { totalAssets: 0n, totalShares: 0n };

// --- contract-mirroring math ---------------------------------------------------
function navPerShare(p: PoolState): bigint {
  if (p.totalShares === 0n) return ONE;
  return (p.totalAssets * ONE) / p.totalShares;
}
function previewShares(p: PoolState, assets: bigint): bigint {
  if (p.totalShares === 0n || p.totalAssets === 0n) return assets;
  return (assets * p.totalShares) / p.totalAssets;
}
function previewAssets(p: PoolState, shares: bigint): bigint {
  if (p.totalShares === 0n) return 0n;
  return (shares * p.totalAssets) / p.totalShares;
}
function applyDeposit(p: PoolState, assets: bigint) {
  const sharesMinted = previewShares(p, assets);
  return { pool: { totalAssets: p.totalAssets + assets, totalShares: p.totalShares + sharesMinted }, sharesMinted };
}
function applyRedeem(p: PoolState, shares: bigint) {
  const assetsOut = previewAssets(p, shares);
  return { pool: { totalAssets: p.totalAssets - assetsOut, totalShares: p.totalShares - shares }, assetsOut };
}
function applySettle(p: PoolState, amount: bigint): PoolState {
  return { totalAssets: p.totalAssets + amount, totalShares: p.totalShares };
}
function applyDefault(p: PoolState, principal: bigint): PoolState {
  const writedown = principal > p.totalAssets ? p.totalAssets : principal;
  return { totalAssets: p.totalAssets - writedown, totalShares: p.totalShares };
}
// RPC boundary (handled by the relay/front, NOT the contract).
const relayWeibarToTinybar = (w: bigint) => w / WEIBAR_PER_TINYBAR;
const relayTinybarToWeibar = (t: bigint) => t * WEIBAR_PER_TINYBAR;

// --- tests ---------------------------------------------------------------------
describe("WaferVault — RPC-boundary weibar <-> tinybar (relay-owned)", () => {
  it("constants are the documented powers of ten", () => {
    expect(ONE).to.equal(100_000_000n);
    expect(WEIBAR_PER_TINYBAR).to.equal(10_000_000_000n);
  });
  it("1 HBAR (weibar) maps to 1e8 tinybar", () => {
    expect(relayWeibarToTinybar(WEIBAR)).to.equal(HBAR);
  });
  it("round-trips tinybar -> weibar -> tinybar exactly", () => {
    const t = 4_200_000_000n;
    expect(relayWeibarToTinybar(relayTinybarToWeibar(t))).to.equal(t);
  });
  it("truncates sub-tinybar weibar dust (does NOT inflate)", () => {
    expect(relayWeibarToTinybar(WEIBAR_PER_TINYBAR + 9_999_999_999n)).to.equal(1n);
    expect(relayWeibarToTinybar(WEIBAR_PER_TINYBAR - 1n)).to.equal(0n);
  });
});

describe("WaferVault — navPerShare", () => {
  it("genesis (no shares) is exactly ONE — 1 share == 1 HBAR", () => {
    expect(navPerShare(empty)).to.equal(ONE);
  });
  it("rises proportionally as assets grow against fixed shares", () => {
    const p: PoolState = { totalAssets: 150n * ONE, totalShares: 100n * ONE };
    expect(navPerShare(p)).to.equal((ONE * 3n) / 2n); // 1.5
  });
});

describe("WaferVault — deposit -> shares", () => {
  it("first deposit mints 1 share micro-unit per tinybar (1:1 at genesis NAV)", () => {
    const { pool, sharesMinted } = applyDeposit(empty, 10n * HBAR);
    expect(sharesMinted).to.equal(10n * ONE);
    expect(pool.totalAssets).to.equal(10n * ONE);
    expect(navPerShare(pool)).to.equal(ONE);
  });
  it("second depositor at NAV > 1 gets fewer shares than HBAR", () => {
    const p: PoolState = { totalAssets: 200n * ONE, totalShares: 100n * ONE }; // NAV 2.0
    expect(navPerShare(p)).to.equal(2n * ONE);
    expect(applyDeposit(p, 20n * HBAR).sharesMinted).to.equal(10n * ONE); // 20 / 2.0 = 10
  });
});

describe("WaferVault — redeem -> HBAR", () => {
  it("redeems shares for the proportional HBAR at NAV", () => {
    const p: PoolState = { totalAssets: 150n * ONE, totalShares: 100n * ONE }; // NAV 1.5
    const { pool, assetsOut } = applyRedeem(p, 10n * ONE);
    expect(assetsOut).to.equal(15n * HBAR);
    expect(pool.totalShares).to.equal(90n * ONE);
    expect(navPerShare(pool)).to.equal(navPerShare(p)); // NAV unchanged by redeem
  });
  it("full deposit -> redeem round-trips the principal (genesis NAV)", () => {
    const dep = applyDeposit(empty, 7n * HBAR);
    const red = applyRedeem(dep.pool, dep.sharesMinted);
    expect(red.assetsOut).to.equal(7n * HBAR);
    expect(red.pool.totalAssets).to.equal(0n);
    expect(red.pool.totalShares).to.equal(0n);
  });
});

describe("WaferVault — settleRewards -> NAV rises", () => {
  it("routing reward HBAR lifts NAV per share for existing holders", () => {
    const dep = applyDeposit(empty, 100n * HBAR); // NAV 1.0
    const settled = applySettle(dep.pool, 10n * HBAR);
    expect(settled.totalAssets).to.equal(110n * ONE);
    expect(navPerShare(settled)).to.equal((ONE * 110n) / 100n); // 1.10
    expect(navPerShare(settled) > navPerShare(dep.pool)).to.equal(true);
  });
  it("the yield accrues to the holder on redeem", () => {
    const dep = applyDeposit(empty, 100n * HBAR);
    const settled = applySettle(dep.pool, 10n * HBAR);
    expect(applyRedeem(settled, dep.sharesMinted).assetsOut).to.equal(110n * HBAR);
  });
});

describe("WaferVault — markDefault -> write-down (NAV falls)", () => {
  it("a default drops NAV per share by the written-down principal", () => {
    const dep = applyDeposit(empty, 100n * HBAR); // NAV 1.0
    const after = applyDefault(dep.pool, 20n * ONE);
    expect(after.totalAssets).to.equal(80n * ONE);
    expect(navPerShare(after)).to.equal((ONE * 80n) / 100n); // 0.80
    expect(navPerShare(after) < navPerShare(dep.pool)).to.equal(true);
  });
  it("write-down is clamped to available assets (never negative)", () => {
    const dep = applyDeposit(empty, 30n * HBAR);
    const after = applyDefault(dep.pool, 999n * ONE);
    expect(after.totalAssets).to.equal(0n);
    expect(navPerShare(after)).to.equal(0n);
  });
});

describe("WaferVault — full lifecycle round-trip (deposit -> settle -> redeem)", () => {
  it("preview functions agree with the applied state transitions", () => {
    let pool = empty;
    const alice = applyDeposit(pool, 50n * HBAR); // genesis
    pool = alice.pool;
    expect(previewShares(empty, 50n * HBAR)).to.equal(alice.sharesMinted);

    pool = applySettle(pool, 25n * HBAR); // NAV -> 1.5
    expect(navPerShare(pool)).to.equal((ONE * 3n) / 2n);

    const preview = previewAssets(pool, alice.sharesMinted);
    const red = applyRedeem(pool, alice.sharesMinted);
    expect(preview).to.equal(red.assetsOut);
    expect(red.assetsOut).to.equal(75n * HBAR); // 50 in + 25 yield
  });

  it("the relay maps RPC weibar deposit values to the tinybar the contract accounts in", () => {
    const seenByContract = relayWeibarToTinybar(12n * WEIBAR);
    expect(seenByContract).to.equal(12n * HBAR);
    expect(applyDeposit(empty, seenByContract).sharesMinted).to.equal(12n * ONE);
  });
});
