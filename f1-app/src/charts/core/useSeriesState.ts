// Per-series visual state from the three things a reader can do — hide a
// series, hover one, or select a set — so every primitive dims and focuses
// the same way. Colour never changes with state; only opacity and weight.

export type SeriesVisual = "normal" | "focus" | "dim" | "hidden";

export interface SeriesStateInput {
  hidden?: ReadonlySet<string>;
  hovered?: string | null;
  /** Keys in focus for another reason (a selection, the "top 3" default). */
  focus?: ReadonlySet<string> | null;
}

export function seriesVisual(key: string, st: SeriesStateInput): SeriesVisual {
  if (st.hidden?.has(key)) return "hidden";
  if (st.hovered) return st.hovered === key ? "focus" : "dim";
  if (st.focus && st.focus.size) return st.focus.has(key) ? "focus" : "dim";
  return "normal";
}

export const VISUAL = {
  normal: { opacity: 0.95, width: 2 },
  focus: { opacity: 1, width: 3 },
  dim: { opacity: 0.18, width: 1.25 },
  hidden: { opacity: 0, width: 0 },
} as const;
