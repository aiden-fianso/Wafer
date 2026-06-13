import React, { useEffect, useRef } from "react";

const CARDS = [
  {
    title: "FINANCE",
    counter: "01 / 03",
    className: "p1",
    text: "DePIN operators sell a slice of their future on-chain rewards for upfront USDC. The vault mints a reward-claim NFT and advances the principal — closing the timing gap between hardware spend and on-chain earnings.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="65%" height="65%">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M17 7h4v4" />
      </svg>
    ),
  },
  {
    title: "EARN",
    counter: "02 / 03",
    className: "p2",
    text: "Investors deposit USDC and receive a fungible pool-share token — exposure to a basket of reward streams. NAV per share rises continuously as reward USDC settles into the vault. No maturity on the share; redeem at NAV any time.",
    icon: <img src="/logos/usd-coin-usdc-logo.svg" alt="USDC" />,
  },
  {
    title: "ON HEDERA",
    counter: "03 / 03",
    className: "p3",
    text: "The vault is a smart contract on the Hedera EVM, using HTS for tokens and real Circle USDC for settlement. Verifiable on HashScan, reconciled via the Mirror Node, with a SaucerSwap secondary market for the share token.",
    icon: <img src="/logos/hedera.svg" alt="Hedera" />,
  },
];

export default function HorizontalScroll() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const titlesRef = useRef([]);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const numCards = track.children.length;

    const tick = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const totalScroll = section.offsetHeight - vh;
      let progress = -rect.top / totalScroll;
      progress = Math.max(0, Math.min(1, progress));

      const translateX = -progress * (numCards - 1) * 100;
      track.style.transform = `translateX(${translateX}vw)`;

      const segLen = 1 / numCards;
      titlesRef.current.forEach((title, i) => {
        if (!title) return;
        const segStart = i * segLen;
        const segEnd = (i + 1) * segLen;
        let local = (progress - segStart) / (segEnd - segStart);
        local = Math.max(-0.5, Math.min(1.5, local));
        const x = 600 - local * 1200;
        title.style.transform = `translateX(${x}px)`;
      });
    };

    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    tick();

    return () => {
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
    };
  }, []);

  return (
    <section className="hscroll-section" ref={sectionRef}>
      <div className="hscroll-sticky">
        <ul className="hscroll-track" ref={trackRef}>
          {CARDS.map((card, i) => (
            <li key={i} className={`hscroll-panel ${card.className}`}>
              <h2
                className="hscroll-bigtitle"
                ref={(el) => (titlesRef.current[i] = el)}
              >
                {card.title}
              </h2>
              <div className="hscroll-counter">{card.counter}</div>
              <div className="hscroll-content">
                <div className="hscroll-content-text">
                  <p>{card.text}</p>
                </div>
                <div className="hscroll-content-icon">{card.icon}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
