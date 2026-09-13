// Tooltip that measures itself. Rendered through a portal at a fixed
// viewport position, flipped and clamped after measuring its own box — no
// guessed widths. `pin()` keeps it open for touch (tap a mark to pin, tap
// elsewhere to release). It is never inside a Section body, so it never
// appears in PNG exports.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./Tooltip.module.css";

export interface TipAnchor { x: number; y: number }      // viewport (client) coordinates

interface TipState { anchor: TipAnchor; content: ReactNode; pinned: boolean; wrap?: boolean }

const GAP = 12;
const PAD = 8;

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const pinnedRef = useRef(false);

  const show = useCallback((anchor: TipAnchor | { clientX: number; clientY: number }, content: ReactNode, opts?: { wrap?: boolean }) => {
    if (pinnedRef.current) return;
    const a = "clientX" in anchor ? { x: anchor.clientX, y: anchor.clientY } : anchor;
    setTip({ anchor: a, content, pinned: false, wrap: opts?.wrap });
  }, []);
  const hide = useCallback(() => { if (!pinnedRef.current) setTip(null); }, []);
  const pin = useCallback((anchor: TipAnchor | { clientX: number; clientY: number }, content: ReactNode, opts?: { wrap?: boolean }) => {
    const a = "clientX" in anchor ? { x: anchor.clientX, y: anchor.clientY } : anchor;
    pinnedRef.current = true;
    setTip({ anchor: a, content, pinned: true, wrap: opts?.wrap });
  }, []);
  const unpin = useCallback(() => { pinnedRef.current = false; setTip(null); }, []);
  const toggle = useCallback((anchor: TipAnchor | { clientX: number; clientY: number }, content: ReactNode, opts?: { wrap?: boolean }) => {
    if (pinnedRef.current) unpin(); else pin(anchor, content, opts);
  }, [pin, unpin]);

  const el = tip ? <TooltipLayer tip={tip} onDismiss={unpin} /> : null;
  return { show, hide, pin, unpin, toggle, el, pinned: !!tip?.pinned };
}

function TooltipLayer({ tip, onDismiss }: { tip: TipState; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = tip.anchor.x - r.width / 2;
    let top = tip.anchor.y - r.height - GAP;
    if (top < PAD) top = tip.anchor.y + GAP;                 // flip below
    if (top + r.height > vh - PAD) top = Math.max(PAD, vh - PAD - r.height);
    left = Math.max(PAD, Math.min(vw - PAD - r.width, left));
    setPos({ left, top });
  }, [tip]);

  useLayoutEffect(() => {
    if (!tip.pinned) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onDismiss(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, [tip.pinned, onDismiss]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={[s.tip, tip.wrap && s.wrap, tip.pinned && s.pinned].filter(Boolean).join(" ")}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      {tip.content}
    </div>,
    document.body,
  );
}

/** Small building blocks for tooltip content. */
export function TipTitle({ children }: { children: ReactNode }) { return <div className={s.title}>{children}</div>; }
export function TipRow({ color, label, value, muted }: { color?: string; label: ReactNode; value?: ReactNode; muted?: boolean }) {
  return (
    <div className={`${s.row} ${muted ? s.muted : ""}`}>
      {color && <span className={s.swatch} style={{ background: color }} aria-hidden="true" />}
      <span className={s.label}>{label}</span>
      {value != null && <span className={s.value}>{value}</span>}
    </div>
  );
}
