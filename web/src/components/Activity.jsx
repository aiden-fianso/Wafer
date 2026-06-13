import React, { useEffect, useState } from "react";
import { readActivity } from "../lib/mirror.js";
import { MOCK_MODE, EXPLORER_URL } from "../lib/config.js";
import { formatHbar, shortAddr, timeAgo } from "../lib/format.js";

// Activity feed: Deposit / Redeem / ClaimFinanced / RewardRouted / Default
// events for the vault, read from the Hedera Mirror Node
// (/api/v1/contracts/{id}/results/logs). Placeholder data until the vault is
// deployed (MOCK_MODE).
const TYPE_META = {
  Deposit: { label: "Deposit", tone: "pos" },
  Redeem: { label: "Redeem", tone: "neutral" },
  ClaimFinanced: { label: "Claim financed", tone: "neutral" },
  RewardRouted: { label: "Reward routed", tone: "pos" },
  Default: { label: "Default", tone: "neg" },
};

function poolName(poolId) {
  // Display names mirror config.MOCK_POOLS ordering.
  return ["GPU-A", "WIFI-B", "ENERGY-A"][poolId] ?? `POOL-${poolId}`;
}

export default function Activity({ refreshKey }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await readActivity();
      if (!cancelled) setEvents(list);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="markets-page">
      {MOCK_MODE && (
        <div className="net-warning" role="status" style={{ marginBottom: "1rem" }}>
          <span>Demo mode — placeholder events. Live feed reads vault logs from the Mirror Node once deployed.</span>
        </div>
      )}
      <div className="mt-card">
        <div className="mt-toolbar">
          <div className="mt-toolbar-left">
            <span className="mt-toolbar-title">Activity</span>
            <span className="mt-count-badge">{events.length}</span>
          </div>
        </div>

        <div className="mt-table-wrap">
          <table className="mt-table">
            <thead>
              <tr>
                <th style={{ width: '10rem' }}>Event</th>
                <th style={{ width: '8rem' }}>Pool</th>
                <th style={{ width: '12rem' }}>Account / Claim</th>
                <th style={{ width: '10rem' }}>Amount</th>
                <th style={{ width: '7rem' }}>When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const meta = TYPE_META[ev.type] || { label: ev.type, tone: "neutral" };
                const subject = ev.account
                  ? (
                    <a className="mt-oracle-label" href={`${EXPLORER_URL}/account/${ev.account}`} target="_blank" rel="noopener noreferrer">
                      {shortAddr(ev.account)}
                    </a>
                  )
                  : ev.claimId != null ? <span className="mt-oracle-label">claim #{ev.claimId}</span> : "—";
                return (
                  <tr key={ev.txHash || i} className="mt-row" style={{ cursor: "default" }}>
                    <td>
                      <div className="mt-cell">
                        <span className="mt-usd-pill">{meta.label}</span>
                      </div>
                    </td>
                    <td>
                      <div className="mt-cell">
                        <span className="mt-token-name">{poolName(ev.poolId)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="mt-cell">{subject}</div>
                    </td>
                    <td>
                      <div className="mt-cell">
                        <span className="mt-amount">{ev.assets != null ? `${formatHbar(ev.assets)} HBAR` : "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="mt-cell">
                        <span className="mt-oracle-label">{timeAgo(ev.ageSeconds)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
