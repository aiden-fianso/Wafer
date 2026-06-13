import React, { useState, useRef, useEffect } from "react";
import { EXPLORER_URL } from "../lib/config.js";
import { shortAddr } from "../lib/format.js";

const NAV_ITEMS = [
  { id: "pools", label: "Pools" },
  { id: "deposit", label: "Deposit" },
  { id: "activity", label: "Activity" },
  { id: "dashboard", label: "Dashboard" },
];

export default function Header({ account, connecting, onConnect, onDisconnect, activeTab, onTabChange }) {
  const [walletOpen, setWalletOpen] = useState(false);
  const walletRef = useRef(null);
  const short = shortAddr(account);

  useEffect(() => {
    const handler = (e) => {
      if (walletRef.current && !walletRef.current.contains(e.target)) setWalletOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="hdr">
      {/* Left: Logo */}
      <div className="hdr-left" onClick={() => onTabChange("home")} style={{ cursor: "pointer" }}>
        <img src="/logos/wafer.svg" alt="Wafer" className="hdr-logo-img" />
        <span className="hdr-brand">WAFER</span>
      </div>

      {/* Center: Nav links (pill group) */}
      {account && (
        <nav className="hdr-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <div key={item.id} className="hdr-nav-item">
                <button
                  type="button"
                  className={`hdr-nav-btn ${active ? "hdr-nav-btn-active" : ""}`}
                  onClick={() => onTabChange(item.id)}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="hdr-nav-label">{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
      )}

      {/* Right: Connect */}
      <div className="hdr-right">
        <div className="wallet-dropdown-wrap" ref={walletRef}>
          <button
            className={`btn-connect ${account ? "connected" : ""}`}
            onClick={account ? () => setWalletOpen(!walletOpen) : onConnect}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : account ? short : "Connect"}
            {account && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '0.375rem', transition: "transform 0.2s", transform: walletOpen ? "rotate(180deg)" : "rotate(0)" }}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          {walletOpen && (
            <div className="wallet-dropdown">
              <div className="wallet-dropdown-addr">
                <span className="wallet-dropdown-label">Connected</span>
                <span className="wallet-dropdown-value">{short}</span>
              </div>
              <a className="wallet-dropdown-link" href={`${EXPLORER_URL}/account/${account}`} target="_blank" rel="noopener noreferrer">
                View on HashScan
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5H9.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
              <button className="wallet-dropdown-disconnect" onClick={() => { onDisconnect(); setWalletOpen(false); }}>Disconnect</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
