// EIP-6963 wallet provider discovery.
// https://eips.ethereum.org/EIPS/eip-6963
//
// Wallet extensions announce themselves by dispatching
// `eip6963:announceProvider` in response to `eip6963:requestProvider`.
// We listen, collect, and expose them to the UI.

const subscribers = new Set();
const providers = new Map(); // rdns → { info, provider }

function emit() {
  const list = [...providers.values()];
  for (const fn of subscribers) fn(list);
}

function handleAnnounce(event) {
  const detail = event.detail;
  if (!detail?.info?.rdns || !detail.provider) return;
  providers.set(detail.info.rdns, detail);
  emit();
}

let initialized = false;
function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("eip6963:announceProvider", handleAnnounce);
  // Ask wallets to announce themselves — they respond synchronously.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getDiscoveredProviders() {
  init();
  return [...providers.values()];
}

export function subscribe(fn) {
  init();
  subscribers.add(fn);
  fn([...providers.values()]);
  // Re-request on subscribe in case a wallet injected late.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  return () => subscribers.delete(fn);
}

// Curated wallet catalog — the modal displays these in order. If a wallet's
// rdns matches an EIP-6963 announcement, we use its injected provider. Else
// the card links to the wallet's install page and is disabled.
export const WALLET_CATALOG = [
  {
    id: "io.metamask",
    name: "MetaMask",
    installUrl: "https://metamask.io/download/",
    // MetaMask fox (PNG data URI)
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUiIGhlaWdodD0iMzQiIHZpZXdCb3g9IjAgMCAzNSAzNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMyLjcwNzcgMzIuNzUyMkwyNS4xNjg4IDMwLjUxNzRMMTkuNDgzMyAzMy45MDA4TDE1LjUxNjcgMzMuODk5MUw5LjgyNzkzIDMwLjUxNzRMMi4yOTIyNSAzMi43NTIyTDAgMjUuMDQ4OUwyLjI5MjI1IDE2LjQ5OTNMMCA5LjI3MDk0TDIuMjkyMjUgMC4zMTIyNTZMMTQuMDY3NCA3LjMxNTU0SDIwLjkzMjZMMzIuNzA3NyAwLjMxMjI1NkwzNSA5LjI3MDk0TDMyLjcwNzcgMTYuNDk5M0wzNSAyNS4wNDg5TDMyLjcwNzcgMzIuNzUyMloiIGZpbGw9IiNGRjVDMTYiLz48L3N2Zz4=",
  },
  {
    id: "io.rabby",
    name: "Rabby Wallet",
    installUrl: "https://rabby.io/",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSIxNiIgZmlsbD0iIzcwODRGRiIvPjxwYXRoIGQ9Ik0yMS4zMTc0IDExLjQ1OTdDMjAuNTMxNCAxMS44MDIyIDE5Ljc5MDggMTIuNDE2OSAxOS4zNTUyIDEzLjIwMjlDMTcuOTkyMSAxMS43MDk4IDE1LjAwMDMgMTAuNDIzOSAxMS40ODk3IDExLjQ1OTdDOS4xMjM5NyAxMi4xNTc3IDcuMTU3OTEgMTMuODAzMiA2LjM5ODA0IDE2LjI4ODVDNy4yNiAxNS40NDcgOC4zMDE4IDE1LjA5NDggOS4zMDAzIDE1LjA5NDhDMTIuNjA5NiAxNS4wOTQ4IDEzLjgyMSAxNy43MzMgMTMuOTQ3NCAxOC45MzY2QzE0LjEyMTIgMjAuNTc1MyAxMi44ODMxIDIxLjg1NDIgMTEuNDg5NyAyMS42OTc5QzguOTgzMDUgMjEuNDE2OCA4LjM4NzE0IDE4LjYyNzkgOS4wNjg1NCAxNi42ODMxQzguNjQxNjYgMTYuODY5OSA4LjIyNjQ2IDE3LjM1NzYgOC4wODM2NSAxNy45NTg2QzcuODAwOTMgMTkuMTUwMyA4LjE5OTE0IDIwLjU2MTIgOS4yMzEgMjEuMjUzNUM5LjM5NTMgMjEuMzYzMyA5LjQ3MDY1IDIxLjU3MDkgOS40MDQ1NSAyMS43NTQ2QzkuMjUwNzEgMjIuMTgxMyA5LjAxMTc0IDIzLjAwODEgOS4wMTA5IDIzLjAxMDNDOS4wMDQ4NCAyMy4wMjY1IDkuNjQ1NzEgMjMuMDkxIDkuOTIxMTggMjMuMDkxQzEwLjczODQgMjMuMDkxIDExLjQ4NTcgMjMuMDUwNyAxMS42ODM4IDIzLjAzNjlMMTIuODM3MyAyMy4wOThDMTQuMjcwNSAyMy4xMDQgMTYuNTAxNyAyMi42NjQyIDE4LjEyODIgMjEuODYyOEMxOS42MzkyIDIxLjExODkgMjAuNjMyMiAyMC4zMzE1IDIxLjEwNDggMTkuNDYyOEMyMi40OTMyIDE3LjU1NzIgMjIuODc0NyAxNS44MDgxIDIyLjg3NDcgMTQuNDAwMkMyMi44NzQ3IDEyLjkzMTMgMjIuNDA1NSAxMi4yMjgxIDIxLjMxNzQgMTEuNDU5N1oiIGZpbGw9IndoaXRlIi8+PC9zdmc+",
  },
  {
    id: "app.phantom",
    name: "Phantom",
    installUrl: "https://phantom.app/download",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAxMjggMTI4IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iNjQiIGZpbGw9IiNBQjlGRjIiLz48cGF0aCBkPSJNMTEwLjU4NCA2NC45MTQ3SDk5LjE0MkM5OS4xNDIgNDEuNjA3IDgwLjEyNTEgMjIuNjY2NyA1Ni42ODc1IDIyLjY2NjdDMzMuNTQzOCAyMi42NjY3IDE0Ljg2MDkgNDEuMjEzIDE0LjIzNDggNjQuMzg1NkMxMy41ODg0IDg4LjM1MSAzNS40ODYzIDExMC42NjcgNTkuNjM1MiAxMTAuNjY3SDYyLjY1NThDODMuOTU2MyAxMTAuNjY3IDExMi41NTIgOTMuOTUzMyAxMTcuMDE1IDczLjY3NjhDMTE3Ljg0MyA2OS45Njc4IDExNC41MTggNjQuOTE0NyAxMTAuNTg0IDY0LjkxNDdaTTQyLjgyMDEgNjUuOTQ1MkM0Mi44MjAxIDY5LjA4ODQgNDAuMjQ1MiA3MS42NjMzIDM3LjEwMiA3MS42NjMzQzMzLjk1ODggNzEuNjYzMyAzMS4zODM5IDY5LjA4ODQgMzEuMzgzOSA2NS45NDUyVjU2Ljc3OTJDMzEuMzgzOSA1My42MzU5IDMzLjk1ODggNTEuMDYxIDM3LjEwMiA1MS4wNjFDNDAuMjQ1MiA1MS4wNjEgNDIuODIwMSA1My42MzU5IDQyLjgyMDEgNTYuNzc5MlY2NS45NDUyWk02NC44NDU4IDY1Ljk0NTJDNjQuODQ1OCA2OS4wODg0IDYyLjI3MDkgNzEuNjYzMyA1OS4xMjc3IDcxLjY2MzNDNTUuOTg0NSA3MS42NjMzIDUzLjQwOTYgNjkuMDg4NCA1My40MDk2IDY1Ljk0NTJWNTYuNzc5MkM1My40MDk2IDUzLjYzNTkgNTUuOTg0NSA1MS4wNjEgNTkuMTI3NyA1MS4wNjFDNjIuMjcwOSA1MS4wNjEgNjQuODQ1OCA1My42MzU5IDY0Ljg0NTggNTYuNzc5MlY2NS45NDUyWiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=",
  },
  {
    id: "io.rabby.wallet",
    name: "Rabby",
    hiddenAlias: true,
    installUrl: "https://rabby.io/",
    icon: "",
  },
  {
    id: "xyz.talisman",
    name: "Talisman",
    installUrl: "https://talisman.xyz/",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZmlsbD0iI2RkZmU3NiIgZD0iTTAgNzAuMjVDMCA5MS41MDUgMCAxMDIuMTMzIDQuNDYzIDExMC4xMDJhMzUgMzUgMCAwIDAgMTMuNDM1IDEzLjQzNUMyNS44NjcgMTI4IDM2LjQ5NSAxMjggNTcuNzUgMTI4aDEyLjVDOTEuNTA1IDEyOCAxMDIuMTMzIDEyOCAxMTAuMTAyIDEyMy41MzdBMzUgMzUgMCAwIDAgMTIzLjUzNyAxMTAuMTAyQzEyOCAxMDIuMTMzIDEyOCA5MS41MDUgMTI4IDcwLjI1di0xMi41YzAtMjEuMjU1IDAtMzEuODgzLTQuNDYzLTM5Ljg1MkEzNSAzNSAwIDAgMCAxMTAuMTAyIDQuNDYzQzEwMi4xMzMgMCA5MS41MDUgMCA3MC4yNSAwaC0xMi41QzM2LjQ5NSAwIDI1Ljg2NyAwIDE3Ljg5OCA0LjQ2M0EzNSAzNSAwIDAgMCA0LjQ2MyAxNy44OThDMCAyNS44NjcgMCAzNi40OTUgMCA1Ny43NVoiLz48cGF0aCBmaWxsPSIjZWE1NzUwIiBkPSJNMzMuODc5IDM1LjEyTDMzLjM4IDU0LjI4MmM4LjEwNyA0LjE2OCAxNS43NSA0LjA3NSAyNC43NCAyLjA2MyAzLjU2LTEuMzk3IDYuMDU2LTEuNzAyIDkuNTExIDBjOS4wNjcgMi44MTYgMTYuOTY5IDEuOTUgMjUuMTg1LTIuMjQzbC0uNDg1LTE5LjE4N2MwLTEwLjgwNS03LjAwNC0xNC45NjItMTQuNjMyLTEyLjczOS0uNzc5LjIzMi0xLjk0NCAxLjI3NC0xLjk0NCAyLjIwN2wtLjE4MSAxOC43MzNhMS43NyAxLjc3IDAgMSAxLTMuNTM4LS4wMTVWMjAuMDY3YTguODM4IDguODM4IDAgMCAwLTE3LjY3NSAwVjQzLjFhMS43NyAxLjc3IDAgMSAxLTMuNTM4LjAxNWwtLjE3Ni0xOC43NDNjMC0uOTIzLTEuMTA5LTEuOTYtMS44ODItMi4xOTItOC44LTIuNjEtMTQuODggMi41MzgtMTQuODggMTIuOTM2WiIvPjwvc3ZnPg==",
  },
  {
    id: "app.subwallet",
    name: "SubWallet",
    installUrl: "https://subwallet.app/",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNODAgNGM1Ny42MyAwIDc2IDE4LjM3IDc2IDc2IDAgNTcuNjMtMTguMzcgNzYtNzYgNzYtNTcuNjMgMC03Ni0xOC4zNy03Ni03NkM0IDIyLjM3IDIyLjM3IDQgODAgNFoiIGZpbGw9IiMwMDRCRkYiLz48cGF0aCBkPSJNMTEyLjYxNSA2Ni43MlY1My4zOThMNTguNzYgMzJMNDggMzcuNDEybC4wNTcgNDEuNDY0IDQwLjI5MiAxNi4wNy0yMS41MiA5LjA3NXYtNy4wMThMNTYuOTUgOTMuMDNsLTguODkzIDQuMTYzdjI1LjM5NUw1OC43NjkgMTI4bDUzLjg0Ni0yNC4wNjJWODYuODY5TDY0LjE1NCA2Ny42NTdWNTZsMzguNDQ5IDE1LjIxNiAxMC4wMTItNC40OTZaIiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  },
  {
    id: "xyz.core",
    name: "Core",
    installUrl: "https://core.app/",
    icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjY0IiBmaWxsPSIjMjgyODJFIi8+PHBhdGggZD0iTTUzLjA3IDQ5YzIuNzMgMCA1LjIgLjYgNy40MiAxLjgyIDIuMjIgMS4yMSAzLjk3IDIuOTMgNS4yNSA1LjE1IDEuMjggMi4yMiAxLjkyIDQuNzggMS45MiA3LjY4IDAgMi45LS42NiA1LjQ2LTEuOTcgNy42OHMtMy4wOCAzLjkzLTUuMzIgNS4xNGMtMi4yMyAxLjIxLTQuNzMgMS44Mi03LjUgMS44Mi0yLjcyIDAtNS4xOC0uNjEtNy4zNy0xLjgyLTIuMTgtMS4yMS0zLjktMi45Mi01LjE1LTUuMTRDMzkuMSA2OS4xMSAzOC40OCA2Ni41NSAzOC40OCA2My42NWMwLTIuOS42NC01LjQ2IDEuOTItNy42OCAxLjI4LTIuMjIgMy4wMy0zLjk0IDUuMjUtNS4xNVM1MC4zNCA0OSA1My4wNyA0OVoiIGZpbGw9IndoaXRlIi8+PC9zdmc+",
  },
];

// Find a matching announced provider by rdns (or by name substring as fallback).
export function matchProvider(catalogEntry, announced) {
  if (!announced?.length) return null;
  const byRdns = announced.find((a) => a.info.rdns === catalogEntry.id);
  if (byRdns) return byRdns;
  const nameLc = catalogEntry.name.toLowerCase();
  return announced.find((a) => a.info.name?.toLowerCase().includes(nameLc)) || null;
}
