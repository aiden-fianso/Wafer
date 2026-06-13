import React, { useEffect, useRef } from "react";

export default function StatusBar({ message, isError, onClear }) {
  // Stash onClear in a ref so a parent that re-creates the callback on
  // every render doesn't restart the dismissal timer mid-countdown.
  const onClearRef = useRef(onClear);
  useEffect(() => { onClearRef.current = onClear; }, [onClear]);

  useEffect(() => {
    if (!message) return;
    // Errors stay until the user clicks them away (so they have time to
    // read, copy, screenshot). Successes still flash for 2s.
    if (isError) return;
    const t = setTimeout(() => onClearRef.current?.(), 2_000);
    return () => clearTimeout(t);
  }, [message, isError]);

  if (!message) return null;

  return (
    <div
      className={`status-bar ${isError ? "error" : "success"}`}
      onClick={() => onClearRef.current?.()}
      role={isError ? "alert" : "status"}
      title={isError ? "Click to dismiss (error stays until you close it)" : undefined}
      style={{ cursor: isError ? "pointer" : "default", whiteSpace: "pre-wrap" }}
    >
      {message}
    </div>
  );
}
