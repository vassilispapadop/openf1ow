import { useEffect, useState } from "react";
import { F, C, R } from "../lib/styles";
import { isLiveSessionGated, onLiveSessionChange } from "../lib/api";

const DISMISS_KEY = "openf1ow:live-banner-dismissed";

export default function LiveSessionBanner() {
  const [gated, setGated] = useState(isLiveSessionGated);
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => onLiveSessionChange(() => setGated(isLiveSessionGated())), []);

  if (!gated || dismissed) return null;

  return (
    <div role="status" style={{
      background: "rgba(255,181,71,0.10)",
      border: "1px solid rgba(255,181,71,0.30)",
      borderRadius: R.md,
      padding: "12px 16px",
      margin: "0 0 14px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      fontFamily: F,
      fontSize: 13,
      color: C.text,
      flexWrap: "wrap",
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: C.warn,
        boxShadow: `0 0 0 4px rgba(255,181,71,0.18)`,
        flexShrink: 0,
      }} />
      <span style={{ flex: "1 1 280px", lineHeight: 1.5 }}>
        <strong style={{ color: C.warn, fontWeight: 700 }}>Live F1 session in progress.</strong>{" "}
        <span style={{ color: C.textDim }}>
          OpenF1 has paused public data access until the session ends. Telemetry will return after the chequered flag.
        </span>
      </span>
      <a
        href="https://www.formula1.com/en/timing/f1-live-timing.html"
        target="_blank"
        rel="noreferrer"
        style={{
          padding: "6px 14px",
          background: C.warn,
          color: "#0a0a0d",
          fontWeight: 700,
          fontSize: 12,
          borderRadius: 999,
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        Watch on F1.com →
      </a>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss banner"
        style={{
          background: "none",
          border: "none",
          color: C.textMute,
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 500,
          padding: "0 4px",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
