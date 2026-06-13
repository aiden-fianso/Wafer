import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

// After a redeploy, an open tab still holds the old index.html with stale chunk
// hashes; lazy `import()` then 404s ("Failed to fetch dynamically imported
// module") on the first code-split route. Catch the failure ONCE and reload to
// pull the fresh index.html. Guarded by sessionStorage so a real persistent
// fetch failure doesn't loop.
const RELOAD_FLAG = "wafer.chunk-reload";
function maybeReloadOnChunkError(reason) {
  const msg = String(reason?.message ?? reason ?? "");
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)) {
    return false;
  }
  if (sessionStorage.getItem(RELOAD_FLAG)) return false;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  window.location.reload();
  return true;
}
window.addEventListener("error", (e) => maybeReloadOnChunkError(e.error));
window.addEventListener("unhandledrejection", (e) => maybeReloadOnChunkError(e.reason));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
