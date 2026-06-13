import React, { useEffect, useRef } from "react";
import { AnimatedBeam } from "./AnimatedBeam.js";

const WAFER_LOGO = <img src="/logos/wafer.svg" alt="Wafer" />;

export default function BeamSection() {
  const containerRef = useRef(null);
  const b1 = useRef(null);
  const b2 = useRef(null);
  const b3 = useRef(null);
  const b5 = useRef(null);
  const b6 = useRef(null);
  const b7 = useRef(null);
  const bC = useRef(null);
  const beamsRef = useRef([]);

  useEffect(() => {
    const init = () => {
      if (!containerRef.current || !bC.current) return;
      const center = bC.current;
      const beamConfigs = [
        { from: b1.current, curvature: -75, endYOffset: -10, gradientStart: '#6366f1', gradientStop: '#a78bfa' },
        { from: b2.current, curvature: 0, endYOffset: 0, gradientStart: '#a855f7', gradientStop: '#6366f1' },
        { from: b3.current, curvature: 75, endYOffset: 10, gradientStart: '#6366f1', gradientStop: '#a78bfa' },
        { from: b5.current, curvature: -75, endYOffset: -10, reverse: true, gradientStart: '#818cf8', gradientStop: '#a78bfa' },
        { from: b6.current, curvature: 0, endYOffset: 0, reverse: true, gradientStart: '#22c55e', gradientStop: '#4ade80' },
        { from: b7.current, curvature: 75, endYOffset: 10, reverse: true, gradientStart: '#818cf8', gradientStop: '#a78bfa' },
      ];
      beamsRef.current = beamConfigs.map((b, i) =>
        new AnimatedBeam({
          container: containerRef.current,
          to: center,
          duration: 4 + i * 0.3,
          delay: i * 0.4,
          ...b,
        })
      );
    };

    requestAnimationFrame(() => requestAnimationFrame(init));

    return () => {
      beamsRef.current.forEach((b) => b.destroy());
      beamsRef.current = [];
    };
  }, []);

  return (
    <section className="beam-section">
      <div className="beam-inner">
        <div className="beam-container" ref={containerRef}>
          <div className="beam-grid">
            <div className="beam-row">
              <div className="beam-circle" ref={b1}><img src="/logos/hedera.svg" alt="GPU-A pool" /></div>
              <div className="beam-circle" ref={b5}><img src="/logos/hedera.svg" alt="WIFI-B pool" /></div>
            </div>
            <div className="beam-row">
              <div className="beam-circle" ref={b2}><img src="/logos/hedera.svg" alt="ENERGY-A pool" /></div>
              <div className="beam-circle center" ref={bC}>{WAFER_LOGO}</div>
              <div className="beam-circle" ref={b6}><img src="/logos/hedera.svg" alt="HBAR" /></div>
            </div>
            <div className="beam-row">
              <div className="beam-circle" ref={b3}><img src="/logos/hedera.svg" alt="DePIN operator" /></div>
              <div className="beam-circle" ref={b7}><img src="/logos/hedera.svg" alt="HBAR" /></div>
            </div>
          </div>
        </div>
        <div className="beam-text-side">
          <h2><span className="line-1">DePIN rewards in,</span><br />HBAR liquidity out</h2>
          <p>Wafer pools standardize DePIN reward streams by network and risk. Operators finance future on-chain rewards for upfront HBAR; investors hold a fungible pool-share token whose NAV rises as reward HBAR flows in — redeemable at NAV, tradable on SaucerSwap. Built on Hedera HTS, settled in native HBAR.</p>
        </div>
      </div>
    </section>
  );
}
