import React, { useState, useCallback, useRef } from "react";
import { M } from "../../lib/styles";

export interface ScatterPoint { x: number; y: number; color: string; label: string }

function useTooltip(externalRef?: React.RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef || internalRef;

  const show = useCallback((e: React.MouseEvent | MouseEvent, content: React.ReactNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top, content });
  }, [containerRef]);
  const hide = useCallback(() => setTip(null), []);

  const el = tip ? (
    <div style={{
      position: "absolute",
      left: tip.x,
      top: tip.y - 8,
      transform: "translate(-50%, -100%)",
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
  ) : null;

  return { containerRef, show, hide, el };
}

export default useTooltip;
