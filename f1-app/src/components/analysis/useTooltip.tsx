import React, { useState, useCallback, useRef } from "react";
import { M } from "../../lib/styles";

export interface ScatterPoint { x: number; y: number; color: string; label: string }

function useTooltip(externalRef?: React.RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef || internalRef;

  const show = useCallback((e: React.MouseEvent | MouseEvent | React.PointerEvent, content: React.ReactNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ev = e as MouseEvent;
    setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, content });
  }, [containerRef]);
  const hide = useCallback(() => setTip(null), []);

  // Tooltip positioning: clamp to container so it never overflows the
  // viewport edge on narrow screens. Approx tooltip width ~180px (whitespace
  // nowrap content rarely exceeds this for our values); the math is
  // deliberately simple — render below the cursor when near the top edge.
  const el = tip ? (() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const wrapW = rect?.width ?? 9999;
    const TIP_W = 200;       // approx; whitespace:nowrap caps real width
    const HALF = TIP_W / 2;
    const PAD = 6;
    const clampedX = Math.max(HALF + PAD, Math.min(wrapW - HALF - PAD, tip.x));
    const above = tip.y > 60; // flip below cursor near top edge
    return (
      <div style={{
        position: "absolute",
        left: clampedX,
        top: above ? tip.y - 8 : tip.y + 16,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        maxWidth: TIP_W,
        background: "rgba(10,14,20,0.95)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        fontFamily: M,
        color: "#e8e8ec",
        pointerEvents: "none" as const,
        zIndex: 10,
        whiteSpace: "nowrap" as const,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}>{tip.content}</div>
    );
  })() : null;

  return { containerRef, show, hide, el };
}

export default useTooltip;
