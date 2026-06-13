import React, { useState } from "react";

const ITEMS = [
  {
    q: "What is Wafer?",
    a: "Wafer is an InfraFi liquidity protocol for DePIN. It lets operators (GPU/compute, wireless, mapping, energy) sell a slice of their future on-chain rewards for upfront USDC, and lets investors buy a fungible pool-share token — exposure to a basket of reward streams — that appreciates in NAV and is redeemable any time.",
  },
  {
    q: "Why does DePIN need this?",
    a: "DePIN operators spend on hardware today but earn their rewards on-chain over weeks or months. That timing gap is a financing problem. Wafer closes it: an operator receives USDC upfront, the rewards flow into the vault as they settle, and the spread is the yield shared across pool-share holders.",
  },
  {
    q: "How does the pool-share token work?",
    a: "Each pool issues a continuously-appreciating NAV unit, like a money-market fund share — not a zero-coupon bond. NAV per share = totalAssets / totalShares (6-dp USDC). As reward USDC settles into the vault, NAV rises. There is no maturity on the share; maturity is a property of each underlying reward claim.",
  },
  {
    q: "What is the settlement asset?",
    a: "Real Circle USDC on Hedera testnet (0.0.429274, 6 decimals) — never a mock. Pool shares are also 6-decimal HTS tokens. The vault is a smart contract on the Hedera EVM that creates and holds the HTS tokens and reward-claim NFTs.",
  },
  {
    q: "How do I get in and out?",
    a: "Connect a wallet on Hedera Testnet (chain 296). Deposit USDC to mint shares at NAV (associate the share token, approve USDC, deposit). Redeem shares back to USDC at NAV at any time — redeem-at-NAV is the guaranteed exit. A SaucerSwap pool offers a secondary market for the share token.",
  },
];

const PlusIcon = () => (
  <svg className="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    <section className="faq-section">
      <div className="faq-inner">
        <h2 className="faq-title">FAQ</h2>
        <div className="faq-list">
          {ITEMS.map((item, i) => (
            <div key={i} className={`faq-item${openIndex === i ? " open" : ""}`}>
              <button
                className="faq-question"
                onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
              >
                <PlusIcon />
                {item.q}
              </button>
              <div className="faq-content">
                <div><p>{item.a}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
