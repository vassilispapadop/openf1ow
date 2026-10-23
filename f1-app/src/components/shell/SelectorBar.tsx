// Selector bar — flat race strip + session pills.
// Replaced by simple session tabs in SessionLayout, but still available for older layouts.

import { useRef, useEffect, useMemo, useCallback } from "react";

interface SelectorBarProps {
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
  onMeeting: (v: string) => void;
  onSession: (v: string) => void;
}

export default function SelectorBar({ meetings, mk, sessions, sk, onMeeting, onSession }: SelectorBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const races = useMemo(
    () => meetings.filter(m =>
      !m.meeting_name?.toLowerCase().includes("testing") && !m.is_cancelled,
    ),
    [meetings],
  );

  useEffect(() => {
    if (!scrollRef.current || !mk) return;
    const el = scrollRef.current.querySelector(`[data-mk="${mk}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [mk]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  const DRAG_THRESHOLD = 8;
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0, suppressClick: false });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    dragState.current = { active: true, startX: e.clientX, scrollLeft: scrollRef.current.scrollLeft, suppressClick: false };
    scrollRef.current.style.cursor = "grabbing";
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || !scrollRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) dragState.current.suppressClick = true;
    if (Math.abs(dx) > 0) scrollRef.current.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);
  const onPointerUp = useCallback(() => {
    dragState.current.active = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }, []);
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragState.current.suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      dragState.current.suppressClick = false;
    }
  }, []);

  if (!races.length) return <div style={{ marginBottom: 16, height: 48 }} aria-busy="true" />;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        ref={scrollRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          display: "flex", gap: 6, overflowX: "auto",
          padding: "2px 0 10px",
          scrollbarWidth: "none",
          cursor: "grab",
          userSelect: "none",
          touchAction: "pan-x",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {races.map(m => {
          const selected = String(m.meeting_key) === mk;
          const isPast = new Date(m.date_start) < new Date();
          return (
            <button
              key={m.meeting_key}
              data-mk={m.meeting_key}
              onClick={() => onMeeting(String(m.meeting_key))}
              style={{
                flexShrink: 0,
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 12px 5px 5px",
                borderRadius: 999,
                border: "1px solid " + (selected ? "var(--border-strong)" : "var(--border)"),
                background: selected ? "var(--surface-alt)" : "var(--surface)",
                cursor: "pointer",
                transition: "border-color 0.15s ease, background 0.15s ease",
                outline: "none",
                opacity: isPast ? 1 : 0.45,
              }}
            >
              {m.country_flag && (
                <img src={m.country_flag} alt=""
                  style={{ width: 22, height: 15, borderRadius: 2, objectFit: "cover" }} />
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: selected ? "var(--text)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {m.circuit_short_name || m.location || m.country_name}
                </div>
                <div style={{ fontSize: 9, color: selected ? "var(--text-muted)" : "var(--text-faint)", whiteSpace: "nowrap", marginTop: 1, fontFamily: "var(--mono)" }}>
                  {new Date(m.date_start).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {sessions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sessions.map(s => {
            const selected = String(s.session_key) === sk;
            return (
              <button key={s.session_key} onClick={() => onSession(String(s.session_key))}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  border: "1px solid " + (selected ? "var(--border-strong)" : "var(--border)"),
                  background: selected ? "var(--surface-alt)" : "transparent",
                  color: selected ? "var(--text)" : "var(--text-muted)",
                  fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                  transition: "border-color 0.15s ease, background 0.15s ease, color 0.15s ease",
                  outline: "none",
                }}>
                {s.session_name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
