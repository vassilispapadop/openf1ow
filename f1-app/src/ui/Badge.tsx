// Small status chip: confidence, flags (SC / VSC / RED / PIT), compounds,
// "retired L20". Status tones are reserved for state — never a series colour.

import type { ReactNode } from "react";
import s from "./Badge.module.css";

export type BadgeTone = "pos" | "warn" | "neg" | "violet" | "accent" | "mute";

export default function Badge({ tone = "mute", size = "md", dot, title, children, style }: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  dot?: boolean;
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`${s.badge} ${s[size]} ${s[tone]}`} title={title} style={style}>
      {dot && <span className={s.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
