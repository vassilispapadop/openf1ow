// The legend as a control surface: hover to focus a series, click to toggle
// it, alt/long-press to isolate it, star to follow. Labels are text tokens;
// the swatch carries the colour (dashed when the series is dashed, so two
// teammates in one livery are still told apart without colour).
//
// This is the local-state version. Binding to a shared SelectionContext
// (so every chart on the page dims together) comes with the interaction
// phase; the props are shaped so that binding is a wrapper, not a rewrite.

import { useCallback, useRef, type ReactNode } from "react";
import s from "./Legend.module.css";

export interface LegendItem {
  key: string;
  label: ReactNode;
  color: string;
  dash?: boolean;
  marker?: "line" | "dot";
  value?: ReactNode;          // right-hand value, e.g. the hovered round's gap
  followed?: boolean;
}

export interface LegendProps {
  items: LegendItem[];
  hidden?: ReadonlySet<string>;
  hovered?: string | null;
  /** Keys that are in focus for another reason (a selection); others dim. */
  focus?: ReadonlySet<string> | null;
  onHover?: (key: string | null) => void;
  onToggle?: (key: string) => void;
  onIsolate?: (key: string) => void;
  onFollow?: (key: string) => void;
  columns?: number;
  compact?: boolean;
  hint?: boolean;             // show the "hover · click · alt-click" hint row
  className?: string;
}

export default function Legend({ items, hidden, hovered, focus, onHover, onToggle, onIsolate, onFollow, columns, compact, hint, className }: LegendProps) {
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const startPress = useCallback((key: string) => {
    if (!onIsolate) return;
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => { longPressed.current = true; onIsolate(key); }, 450);
  }, [onIsolate]);
  const endPress = useCallback(() => {
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);

  const anyFocus = !!(hovered || (focus && focus.size));
  const cls = [s.legend, columns && s.cols, compact && s.compact, className].filter(Boolean).join(" ");

  return (
    <div className={cls} style={columns ? ({ "--legend-cols": columns } as React.CSSProperties) : undefined} role="list">
      {items.map(it => {
        const isHidden = hidden?.has(it.key) ?? false;
        const isFocus = hovered === it.key || (focus?.has(it.key) ?? false);
        const state = isHidden ? s.hidden : isFocus ? s.focus : anyFocus ? s.dim : "";
        return (
          <span key={it.key} role="listitem" style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              type="button"
              className={`${s.item} ${state}`}
              aria-pressed={!isHidden}
              onMouseEnter={() => onHover?.(it.key)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(it.key)}
              onBlur={() => onHover?.(null)}
              onPointerDown={() => startPress(it.key)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onClick={e => {
                if (longPressed.current) { longPressed.current = false; return; }
                if ((e.altKey || e.metaKey) && onIsolate) onIsolate(it.key);
                else onToggle?.(it.key);
              }}
            >
              <span
                className={`${s.swatch} ${it.dash ? s.swatchDash : ""} ${it.marker === "dot" ? s.swatchDot : ""}`}
                style={{ color: it.color }}
                aria-hidden="true"
              />
              <span className={s.label}>{it.label}</span>
              {it.value != null && <span className={s.value}>{it.value}</span>}
            </button>
            {onFollow && (
              <button
                type="button"
                className={`${s.star} ${it.followed ? s.on : ""}`}
                aria-label={it.followed ? "Unfollow" : "Follow"}
                aria-pressed={!!it.followed}
                onClick={() => onFollow(it.key)}
              >★</button>
            )}
          </span>
        );
      })}
      {hint && (onToggle || onIsolate) && (
        <span className={s.hintRow}>
          hover highlights · click hides{onIsolate ? " · alt-click or long-press isolates" : ""}
        </span>
      )}
    </div>
  );
}
