import React, { useEffect, useState } from "react";
import DepositWidget from "./DepositWidget.jsx";
import { MOCK_MODE } from "../lib/config.js";
import { formatHbar, formatNav } from "../lib/format.js";

// Pools screen. Lists Wafer pools (GPU-A, WIFI-B, …)
// with NAV/share, TVL, network + risk. Clicking a pool opens its Deposit/Redeem
// panel. Data comes from contracts.getPools() — mock placeholders until the
// vault is deployed.
export default function Pools({ contracts, onStatus, refreshKey }) {
  const [pools, setPools] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!contracts) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await contracts.getPools();
        if (!cancelled) setPools(list);
      } catch {
        // leave previous
      }
    })();
    return () => { cancelled = true; };
  }, [contracts, refreshKey]);

  const filtered = pools.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.network.toLowerCase().includes(search.toLowerCase())
  );

  if (selected != null) {
    const pool = pools.find((p) => p.poolId === selected);
    if (!pool) { setSelected(null); return null; }
    return (
      <div className="markets-page">
        <div className="detail-header">
          <button className="detail-back" onClick={() => setSelected(null)}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Pools
          </button>
          <div className="detail-title">
            <div className="mt-token">
              <div className="mt-token-icon"><img src={pool.networkLogo} alt={pool.network} /></div>
              <span className="detail-pair">{pool.name}</span>
              <span className="detail-lltv">Risk {pool.risk}</span>
            </div>
          </div>
        </div>
        <DepositWidget pool={pool} contracts={contracts} onStatus={onStatus} refreshKey={refreshKey} />
      </div>
    );
  }

  return (
    <div className="markets-page">
      {MOCK_MODE && (
        <div className="net-warning" role="status" style={{ marginBottom: "1rem" }}>
          <span>Demo mode — placeholder pool data. Wire VITE_VAULT_ADDRESS once WaferVault is deployed.</span>
        </div>
      )}
      <div className="mt-card">
        <div className="mt-toolbar">
          <div className="mt-toolbar-left">
            <span className="mt-toolbar-title">Pools</span>
            <span className="mt-count-badge">{pools.length}</span>
          </div>
          <div className="mt-toolbar-right">
            <div className="mt-search">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 13.5L15.8333 15.8333" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                <path d="M9.35 14.54C12.22 14.54 14.54 12.22 14.54 9.35C14.54 6.49 12.22 4.17 9.35 4.17C6.49 4.17 4.17 6.49 4.17 9.35C4.17 12.22 6.49 14.54 9.35 14.54Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
              <input placeholder="Filter pools" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-table-wrap">
          <table className="mt-table">
            <thead>
              <tr>
                <th style={{ width: '4.375rem' }}>Network</th>
                <th style={{ width: '12rem' }}>Pool</th>
                <th style={{ width: '6rem' }}>Risk</th>
                <th style={{ width: '9.375rem' }}>NAV / share</th>
                <th style={{ width: '10rem' }}>TVL</th>
                <th style={{ width: '6.25rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.poolId} className="mt-row" onClick={() => setSelected(p.poolId)}>
                  <td>
                    <div className="mt-cell">
                      <div className="mt-network-icon">
                        <img src={p.networkLogo} alt={p.network} width="44" height="44" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="mt-cell">
                      <div className="mt-token">
                        <span className="mt-token-name">{p.name}</span>
                        <span className="mt-oracle-label" style={{ marginLeft: "0.5rem" }}>{p.network}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="mt-cell">
                      <span className="mt-lltv">{p.risk}</span>
                    </div>
                  </td>
                  <td>
                    <div className="mt-cell">
                      <span className="mt-rate">{formatNav(p.navPerShare)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="mt-cell">
                      <div className="mt-amount-col">
                        <span className="mt-amount">{formatHbar(p.totalAssets)} HBAR</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="mt-cell">
                      <span className="mt-usd-pill">{p.status === 1 ? "Paused" : "Active"}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
