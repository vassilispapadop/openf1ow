// The standard raised card: one surface, border and padding for the small
// panels that sit beside charts (readouts, detail cards, summary tiles), so
// they stop re-declaring the same inline style.

import type { CSSProperties, ReactNode } from "react";
import s from "./Panel.module.css";

export default function Panel({ children, accent, padded = true, className, style, as: Tag = "div" }: {
  children: ReactNode;
  /** Left border colour, e.g. a team colour. */
  accent?: string;
  padded?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "aside" | "article" | "a";
}) {
  const T = Tag as "div";
  return (
    <T
      className={[s.panel, padded && s.padded, accent && s.accent, className].filter(Boolean).join(" ")}
      style={accent ? { ...style, borderLeftColor: accent } : style}
    >
      {children}
    </T>
  );
}
