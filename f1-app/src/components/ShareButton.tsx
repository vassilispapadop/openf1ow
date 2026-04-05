import { useState, useCallback } from "react";
import { F } from "../lib/styles";
import { captureCanvas, captureCanvasStack, captureDom, copyToClipboard, downloadPng } from "../lib/snapshot";

type Status = "idle" | "copying" | "copied" | "downloaded" | "linked" | "error";

export default function ShareButton({ canvasRef, canvasRefs, domRef, meta, filename }: {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  canvasRefs?: React.RefObject<HTMLCanvasElement | null>[];
  domRef?: React.RefObject<HTMLElement | null>;
  meta?: string;
  filename?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [showMenu, setShowMenu] = useState(false);

  const getBlob = useCallback(async () => {
    if (canvasRefs) {
      const canvases = canvasRefs.map(r => r.current).filter(Boolean) as HTMLCanvasElement[];
      if (!canvases.length) return null;
      return captureCanvasStack(canvases, meta);
    }
    if (canvasRef?.current) {
      return captureCanvas(canvasRef.current, meta);
    }
    if (domRef?.current) {
      return captureDom(domRef.current, meta);
    }
    return null;
  }, [canvasRef, canvasRefs, domRef, meta]);

  const onCopy = useCallback(async () => {
    setStatus("copying");
    try {
      const blob = await getBlob();
      if (!blob) { setStatus("error"); return; }
      const ok = await copyToClipboard(blob);
      setStatus(ok ? "copied" : "error");
    } catch { setStatus("error"); }
    setShowMenu(false);
    setTimeout(() => setStatus("idle"), 2000);
  }, [getBlob]);

  const onDownload = useCallback(async () => {
    try {
      const blob = await getBlob();
      if (!blob) { setStatus("error"); return; }
      downloadPng(blob, (filename || "openf1ow-chart") + ".png");
      setStatus("downloaded");
    } catch { setStatus("error"); }
    setShowMenu(false);
    setTimeout(() => setStatus("idle"), 2000);
  }, [getBlob, filename]);

  const onCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("linked");
    } catch { setStatus("error"); }
    setShowMenu(false);
    setTimeout(() => setStatus("idle"), 2000);
  }, []);

  const label = status === "copied" ? "Copied!" : status === "downloaded" ? "Saved!" : status === "linked" ? "Link copied!" : status === "error" ? "Failed" : "Share";
  const color = status === "copied" || status === "downloaded" || status === "linked" ? "#22c55e" : status === "error" ? "#ef4444" : "rgba(255,255,255,0.35)";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: F,
          color,
          cursor: "pointer",
          letterSpacing: "0.5px",
          textTransform: "uppercase" as const,
          transition: "all 0.2s ease",
        }}
      >
        {label}
      </button>
      {showMenu && status === "idle" && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 4,
          background: "rgba(12,12,24,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: 4,
          zIndex: 50,
          minWidth: 140,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <button onClick={onCopyLink} style={menuItemStyle}>
            Copy link
          </button>
          <button onClick={onCopy} style={menuItemStyle}>
            Copy image
          </button>
          <button onClick={onDownload} style={menuItemStyle}>
            Download PNG
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.6)",
  padding: "8px 12px",
  fontSize: 11,
  fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 6,
};
