import React, { useEffect, useState } from "react";
import { MOCK_MODE } from "../lib/config.js";
import { formatHbar, formatNav, assetsForShares } from "../lib/format.js";

// Dashboard: the connected wallet's pool-share balances + their HBAR value at
// current NAV. Placeholder (zeroes) until the vault is deployed.
export default function Dashboard({ contracts, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [hbarBalance, setHbarBalance] = useState(null);

  useEffect(() => {
    if (!contracts) return;
    let cancelled = false;
    (async () => {
      try {
        const pools = await contracts.getPools();
        const [balances, hbar] = await Promise.all([
          Promise.all(pools.map((p) => contracts.getShareBalance(p.poolId))),
          contracts.getHbarBalance(),
        ]);
        if (cancelled) return;
        const next = pools.map((p, i) => {
          const shares = balances[i] ?? 0n;
          const value = assetsForShares(shares, p.navPerShare);
          return { poolId: p.poolId, name: p.name, network: p.network, navPerShare: p.navPerShare, shares, value };
        });
        setRows(next);
        setHbarBalance(hbar);
      } catch {
        // leave previous
      }
    })();
    return () => { cancelled = true; };
  }, [contracts, refreshKey]);

  const totalValue = rows.reduce((acc, r) => acc + (r.value ?? 0n), 0n);

  return (
    <div>
      {MOCK_MODE && (
        <div className="net-warning" role="status" style={{ marginBottom: "1rem" }}>
          <span>Demo mode — your live positions appear here once WaferVault is deployed and you deposit.</span>
        </div>
      )}

      <div className="card">
        <h2>Your Portfolio</h2>
        <div className="balances-grid">
          <div className="balance-item">
            <div className="balance-label">Total share value</div>
            <div className="balance-value">{formatHbar(totalValue)} <span style={{ fontSize: "0.7em", color: "rgba(255,255,255,0.5)" }}>HBAR</span></div>
          </div>
          <div className="balance-item">
            <div className="balance-label"><img src="/logos/hedera.svg" alt="HBAR" className="balance-icon" /> HBAR balance</div>
            <div className="balance-value">{hbarBalance == null ? "—" : formatHbar(hbarBalance)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Pool positions</h2>
        <div className="mt-table-wrap">
          <table className="mt-table">
            <thead>
              <tr>
                <th style={{ width: '12rem' }}>Pool</th>
                <th style={{ width: '10rem' }}>Your shares</th>
                <th style={{ width: '9rem' }}>NAV / share</th>
                <th style={{ width: '10rem' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.poolId} className="mt-row" style={{ cursor: "default" }}>
                  <td>
                    <div className="mt-cell">
                      <span className="mt-token-name">{r.name}</span>
                      <span className="mt-oracle-label" style={{ marginLeft: "0.5rem" }}>{r.network}</span>
                    </div>
                  </td>
                  <td><div className="mt-cell"><span className="mt-amount">{formatHbar(r.shares)}</span></div></td>
                  <td><div className="mt-cell"><span className="mt-rate">{formatNav(r.navPerShare)}</span></div></td>
                  <td><div className="mt-cell"><span className="mt-amount">{formatHbar(r.value)} HBAR</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
