import React, { useState, useCallback, useEffect, useRef } from "react";
import Header from "./components/Header.jsx";
import StatusBar from "./components/StatusBar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Pools from "./components/Pools.jsx";
import Activity from "./components/Activity.jsx";
import LandingPage from "./components/LandingPage/LandingPage.jsx";
import WalletModal from "./components/WalletModal.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { useContracts } from "./hooks/useContracts.js";
import { formatError } from "./lib/errors.js";

export default function App() {
  const { account, walletClient, publicClient, connecting, connect, disconnect, wrongNetwork, switchNetwork } = useWallet();
  const contracts = useContracts(walletClient, publicClient, account);

  const [tab, setTab] = useState("home");
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Coalesce rapid refreshKey bumps so an interactive action plus the periodic
  // tick don't cascade duplicate reads across screens.
  const refreshTimerRef = useRef(null);
  const bumpRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
      refreshTimerRef.current = null;
    }, 250);
  }, []);
  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // Background auto-refresh while connected (paused when the tab is hidden).
  useEffect(() => {
    if (!account) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      bumpRefresh();
    };
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, [account, bumpRefresh]);

  const onStatus = useCallback((msg, isError = false) => {
    setStatus(msg);
    setStatusError(isError);
    bumpRefresh();
  }, [bumpRefresh]);

  const onSwitchNetwork = useCallback(async () => {
    try {
      await switchNetwork();
    } catch (e) {
      onStatus(formatError(e), true);
    }
  }, [switchNetwork, onStatus]);

  const clearStatus = useCallback(() => setStatus(null), []);

  const doConnect = useCallback(async (selectedProvider) => {
    try {
      await connect(selectedProvider);
      onStatus("Wallet connected!");
    } catch (e) {
      onStatus(formatError(e), true);
      throw e;
    }
  }, [connect, onStatus]);

  const openWalletModal = useCallback(() => setWalletModalOpen(true), []);
  const closeWalletModal = useCallback(() => setWalletModalOpen(false), []);

  // Auto-close modal and navigate to dashboard on first connect.
  useEffect(() => {
    if (account) {
      setWalletModalOpen(false);
      setTab("dashboard");
    }
  }, [account]);

  // Landing page: shown when not connected, or when connected and tab is "home".
  if (!account || tab === "home") {
    return (
      <>
        <LandingPage
          onConnect={account ? () => setTab("dashboard") : openWalletModal}
          connecting={connecting}
          refreshKey={refreshKey}
        />
        <WalletModal
          open={walletModalOpen}
          onClose={closeWalletModal}
          onConnect={doConnect}
          connecting={connecting}
        />
      </>
    );
  }

  return (
    <div className="app">
      <Header
        account={account}
        connecting={connecting}
        onConnect={openWalletModal}
        onDisconnect={disconnect}
        activeTab={tab}
        onTabChange={setTab}
      />
      {wrongNetwork && (
        <div className="net-warning" role="alert">
          <span>Wrong network — switch to Hedera Testnet (296) to use Wafer.</span>
          <button onClick={onSwitchNetwork}>Switch network</button>
        </div>
      )}
      <StatusBar message={status} isError={statusError} onClear={clearStatus} />
      <div className="container">
        <ErrorBoundary>
          {tab === "dashboard" && <Dashboard contracts={contracts} refreshKey={refreshKey} />}
          {/* Pools and Deposit share the Pools screen: pick a pool, then
              deposit/redeem in its panel. */}
          {(tab === "pools" || tab === "deposit") && <Pools contracts={contracts} onStatus={onStatus} refreshKey={refreshKey} />}
          {tab === "activity" && <Activity refreshKey={refreshKey} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
