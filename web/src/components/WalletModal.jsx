import React, { useEffect, useMemo, useState } from "react";
import { WALLET_CATALOG, matchProvider, subscribe } from "../lib/providers.js";

const CaretIcon = () => (
  <svg className="wm-caret" width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M4.16669 10H15.8334" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 4.16675L15.8333 10.0001L10 15.8334" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2.58" y="1.52" width="14" height="1.5" rx="0.75" transform="rotate(45 2.58 1.52)" fill="currentColor"/>
    <rect x="1.52" y="11.42" width="14" height="1.5" rx="0.75" transform="rotate(-45 1.52 11.42)" fill="currentColor"/>
  </svg>
);

export default function WalletModal({ open, onClose, onConnect, connecting }) {
  const [announced, setAnnounced] = useState([]);
  const [connectingId, setConnectingId] = useState(null);

  useEffect(() => {
    if (!open) return;
    const unsub = subscribe(setAnnounced);
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);

  const entries = useMemo(() => {
    return WALLET_CATALOG
      .filter((c) => !c.hiddenAlias)
      .map((c) => {
        const match = matchProvider(c, announced);
        return {
          ...c,
          installed: !!match,
          provider: match?.provider,
          announcedIcon: match?.info?.icon,
          announcedName: match?.info?.name,
        };
      });
  }, [announced]);

  if (!open) return null;

  const handleClick = async (entry) => {
    if (entry.notImplemented) {
      window.open(entry.installUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!entry.installed) {
      window.open(entry.installUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (connecting || connectingId) return;
    setConnectingId(entry.id);
    try {
      await onConnect(entry.provider);
    } catch {
      // Error surfaced via parent StatusBar
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <div className="wm-backdrop open" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wm-dialog" role="dialog" aria-modal="true" aria-labelledby="wm-title">
        <button className="wm-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="wm-body">
          <h2 id="wm-title" className="wm-title">Connect wallet</h2>
          <ul className="wm-list">
            {entries.map((entry) => {
              const busy = connectingId === entry.id;
              const iconSrc = entry.announcedIcon || entry.icon;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="wm-item"
                    onClick={() => handleClick(entry)}
                    disabled={busy}
                  >
                    <div className="wm-item-left">
                      {iconSrc
                        ? <img src={iconSrc} alt={entry.name} width={28} height={28} />
                        : <div className="wm-item-icon-fallback">{entry.name[0]}</div>}
                      <span className="wm-item-name">{entry.announcedName || entry.name}</span>
                      {!entry.installed && !entry.notImplemented && (
                        <span className="wm-item-tag">Install</span>
                      )}
                      {entry.notImplemented && (
                        <span className="wm-item-tag">Soon</span>
                      )}
                      {busy && <span className="wm-item-tag">Connecting…</span>}
                    </div>
                    <CaretIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
