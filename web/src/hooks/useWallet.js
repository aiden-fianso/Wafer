import { useState, useCallback, useEffect, useRef } from "react";
import { createWalletClient, createPublicClient, custom, http, defineChain } from "viem";
import { CHAIN_ID, CHAIN_NAME, RPC_URL, EXPLORER_URL, NATIVE_CURRENCY } from "../lib/config.js";

// Hedera Testnet as a viem chain. nativeCurrency.decimals = 18 (EVM weibar) —
// keep HBAR/gas math separate from 6-dp USDC accounting (SPEC §6).
export const hederaTestnet = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: NATIVE_CURRENCY,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "HashScan", url: EXPLORER_URL } },
});

// Reads go through the Hedera EVM relay directly (Hashio). The wallet
// (tx signing) stays on MetaMask's provider.
const PUBLIC_READ_TRANSPORT = http(RPC_URL, { retryCount: 3 });

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

async function switchOrAddChain(eth) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_HEX,
          chainName: CHAIN_NAME,
          nativeCurrency: NATIVE_CURRENCY,
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER_URL],
        }],
      });
    } else {
      throw e;
    }
  }
}

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [walletClient, setWalletClient] = useState(null);
  const [publicClient, setPublicClient] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [provider, setProvider] = useState(null);
  const [currentChainId, setCurrentChainId] = useState(null);

  // Synchronous guard so auto-reconnect (mount useEffect) and an explicit
  // Connect click can't both build clients in parallel.
  const connectingRef = useRef(false);

  const connect = useCallback(async (selectedProvider) => {
    const eth = selectedProvider || (typeof window !== "undefined" ? window.ethereum : null);
    if (!eth) throw new Error("No wallet detected. Install MetaMask or another browser wallet.");
    if (connectingRef.current) return;

    connectingRef.current = true;
    setConnecting(true);
    try {
      try {
        await eth.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Not all wallets implement wallet_requestPermissions — ignore.
      }
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("No account returned by wallet");

      await switchOrAddChain(eth);

      const chainIdHex = await eth.request({ method: "eth_chainId" });
      const chainIdNum = parseInt(chainIdHex, 16);

      const wc = createWalletClient({
        chain: hederaTestnet,
        transport: custom(eth),
        account: accounts[0],
      });
      const pc = createPublicClient({
        chain: hederaTestnet,
        transport: PUBLIC_READ_TRANSPORT,
      });

      setProvider(eth);
      setAccount(accounts[0]);
      setWalletClient(wc);
      setPublicClient(pc);
      setCurrentChainId(chainIdNum);
    } finally {
      setConnecting(false);
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setWalletClient(null);
    setPublicClient(null);
    setProvider(null);
    setCurrentChainId(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!provider) return;
    await switchOrAddChain(provider);
  }, [provider]);

  // Auto-reconnect on mount. `eth_accounts` is the silent variant — it returns
  // the already-authorized account list without prompting MetaMask. If the user
  // authorized this dapp in a previous session and is still connected, rebuild
  // the viem clients with no popup.
  useEffect(() => {
    if (account) return;
    if (connectingRef.current) return;
    const eth = typeof window !== "undefined" ? window.ethereum : null;
    if (!eth) return;
    let cancelled = false;
    connectingRef.current = true;
    (async () => {
      try {
        const accounts = await eth.request({ method: "eth_accounts" });
        if (cancelled || !accounts?.[0]) return;
        const chainIdHex = await eth.request({ method: "eth_chainId" });
        const chainIdNum = parseInt(chainIdHex, 16);

        const wc = createWalletClient({
          chain: hederaTestnet,
          transport: custom(eth),
          account: accounts[0],
        });
        const pc = createPublicClient({
          chain: hederaTestnet,
          transport: PUBLIC_READ_TRANSPORT,
        });
        if (cancelled) return;

        setProvider(eth);
        setAccount(accounts[0]);
        setWalletClient(wc);
        setPublicClient(pc);
        setCurrentChainId(chainIdNum);
      } catch {
        // Silent fail — user can still click Connect manually.
      } finally {
        connectingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [account]);

  useEffect(() => {
    const eth = provider;
    if (!account || !eth) return;

    const handleAccountsChanged = (accounts) => {
      if (!accounts.length) {
        disconnect();
        return;
      }
      const newAccount = accounts[0];
      if (newAccount.toLowerCase() !== account.toLowerCase()) {
        const wc = createWalletClient({
          chain: hederaTestnet,
          transport: custom(eth),
          account: newAccount,
        });
        const pc = createPublicClient({
          chain: hederaTestnet,
          transport: PUBLIC_READ_TRANSPORT,
        });
        setAccount(newAccount);
        setWalletClient(wc);
        setPublicClient(pc);
      }
    };

    const handleChainChanged = (chainIdHex) => {
      setCurrentChainId(parseInt(chainIdHex, 16));
    };

    eth.on?.("accountsChanged", handleAccountsChanged);
    eth.on?.("chainChanged", handleChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [account, provider, disconnect]);

  const wrongNetwork = account !== null && currentChainId !== null && currentChainId !== CHAIN_ID;

  return {
    account,
    walletClient,
    publicClient,
    connecting,
    connect,
    disconnect,
    wrongNetwork,
    currentChainId,
    switchNetwork,
  };
}
