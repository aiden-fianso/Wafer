import React, { useState, useEffect, useRef, useCallback } from "react";
import NumberFlow from "@number-flow/react";
import Globe3D from "./Globe3D.jsx";
import BeamSection from "./BeamSection.jsx";
import HorizontalScroll from "./HorizontalScroll.jsx";
import FAQ from "./FAQ.jsx";
import ContactModal from "./ContactModal.jsx";
import { readAggregateStats } from "../../lib/mirror.js";
import "./LandingPage.css";

export default function LandingPage({ onConnect, connecting, refreshKey }) {
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [statsReady, setStatsReady] = useState(false);
  const [tvl, setTvl] = useState(0);
  const [shares, setShares] = useState(0);
  const statsRef = useRef(null);

  const handleGlobeReady = useCallback(() => {
    setLoaderVisible(false);
    setTimeout(() => setStatsReady(true), 400);
  }, []);

  // Fallback: hide loader after 5s even if the globe fails to load.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoaderVisible(false);
      setStatsReady(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  // Aggregate TVL / shares for the hero. Reads via the wallet-free mirror helper
  // so stats show before the user connects. Re-polls every 30s.
  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      const { tvl: t, shares: s } = await readAggregateStats();
      if (cancelled) return;
      setTvl(t);
      setShares(s);
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshKey]);

  // Fade stats with scroll.
  useEffect(() => {
    const handleScroll = () => {
      if (!statsRef.current) return;
      const vh = window.innerHeight;
      const y = window.scrollY;
      const progress = Math.min(1, Math.max(0, (y - vh * 0.8) / (vh * 2.4)));
      const fade = Math.max(0, 1 - progress / 0.55);
      statsRef.current.style.opacity = fade;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="landing">
      <div className={`loader${loaderVisible ? "" : " hide"}`} />

      <section className="hero">
        <div className="globe-wrap">
          <Globe3D onReady={handleGlobeReady} />
        </div>
      </section>

      <nav className="landing-nav">
        <div className="nav-logo"><img src="/logos/wafer.svg" alt="Wafer" className="nav-logo-img" /> WAFER</div>
        <button className="nav-btn" onClick={onConnect} disabled={connecting}>
          {connecting ? "Connecting..." : "Launch App"}
        </button>
      </nav>

      <div className={`stats-row${statsReady ? " ready" : ""}`} ref={statsRef}>
        <div className="stat-block">
          <div className="stat-label">TVL</div>
          <div className="stat-value">
            <span className="dollar">$</span>
            <NumberFlow
              value={tvl}
              format={{ useGrouping: true, maximumFractionDigits: 0 }}
              locales="en-US"
              transformTiming={{ duration: 1600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              spinTiming={{ duration: 1600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </div>
        </div>
        <div className="stat-block">
          <div className="stat-label">Pool shares</div>
          <div className="stat-value">
            <NumberFlow
              value={shares}
              format={{ useGrouping: true, maximumFractionDigits: 0 }}
              locales="en-US"
              transformTiming={{ duration: 1600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              spinTiming={{ duration: 1600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </div>
        </div>
      </div>

      <BeamSection />
      <HorizontalScroll />

      <section className="cta-section">
        <h2>Liquidity for DePIN</h2>
        <p>Wafer turns DePIN operators' future on-chain rewards into upfront HBAR, and gives investors a NAV-appreciating pool-share token they can redeem any time. InfraFi, on Hedera testnet.</p>
        <div className="cta-buttons">
          <button className="gradient-btn" onClick={onConnect} disabled={connecting}>
            {connecting ? "Connecting..." : "Launch App"}
          </button>
          <button className="ghost-btn" onClick={() => setModalOpen(true)}>Contact us</button>
        </div>
      </section>

      <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <FAQ />

      <section className="footer-title">
        <div className="footer-title-inner">
          <div className="big-title">WAFER</div>
        </div>
      </section>
    </div>
  );
}
