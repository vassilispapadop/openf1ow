// One segmented control for every "pick one of a few" toggle: tabs, list |
// graph, s | %, compound filters, sample sizes. Renders a tablist (or a radio
// group when `role="radiogroup"`) with roving tabindex and arrow-key movement.

import { useCallback, useRef, type ReactNode, type KeyboardEvent } from "react";
import s from "./Segmented.module.css";

export interface SegmentedOption<K extends string> {
  key: K;
  label: ReactNode;
  title?: string;
  count?: number;
  disabled?: boolean;
}

export default function Segmented<K extends string>({
  options, value, onChange, size = "md", variant = "outline", ariaLabel, role = "tablist", className,
}: {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: "sm" | "md" | "lg";
  variant?: "outline" | "inverted";
  ariaLabel?: string;
  role?: "tablist" | "radiogroup";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRole = role === "tablist" ? "tab" : "radio";
  const selectedAttr = role === "tablist" ? "aria-selected" : "aria-checked";

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const enabled = options.filter(o => !o.disabled);
    const i = enabled.findIndex(o => o.key === value);
    let next = i;
    if (e.key === "ArrowLeft") next = (i - 1 + enabled.length) % enabled.length;
    if (e.key === "ArrowRight") next = (i + 1) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    if (target) {
      onChange(target.key);
      const btn = ref.current?.querySelector<HTMLButtonElement>(`[data-key="${target.key}"]`);
      btn?.focus();
    }
  }, [options, value, onChange]);

  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      className={[s.group, size === "lg" && s.groupLg, variant === "inverted" && s.inverted, className].filter(Boolean).join(" ")}
      onKeyDown={onKey}
    >
      {options.map(o => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role={itemRole}
            data-key={o.key}
            {...{ [selectedAttr]: selected }}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            className={`${s.opt} ${s[size]}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
            {o.count != null && <span className={s.count}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
