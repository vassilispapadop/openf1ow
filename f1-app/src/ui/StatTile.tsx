// One number with a label: KPI cards, hot stats, trend tiles. Text wears
// text tokens; a coloured dot or bar beside it carries the identity.

import type { ReactNode } from "react";
import s from "./StatTile.module.css";

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;           // label dot colour
  teamColor?: string;        // vertical bar beside the value
  mono?: boolean;            // numeric value in the mono face
  delta?: { value: ReactNode; tone?: "pos" | "neg" | "neutral" };
  spark?: ReactNode;
  href?: string;
  onClick?: () => void;
  grow?: boolean;            // flex: 1 1 200px, for KPI rows
  className?: string;
  title?: string;
}

export default function StatTile({ label, value, sub, accent, teamColor, mono, delta, spark, href, onClick, grow, className, title }: StatTileProps) {
  const inner = (
    <>
      <div className={s.label}>
        {accent && <span className={s.dot} style={{ background: accent }} aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className={s.valueRow}>
        {teamColor && <span className={s.bar} style={{ background: teamColor }} aria-hidden="true" />}
        <span className={`${s.value} ${mono ? s.num : ""}`}>{value}</span>
      </div>
      {sub && <div className={s.sub}>{sub}</div>}
      {delta && <div className={`${s.delta} ${delta.tone === "pos" ? s.pos : delta.tone === "neg" ? s.neg : ""}`}>{delta.value}</div>}
      {spark && <div className={s.spark}>{spark}</div>}
    </>
  );
  const cls = [s.tile, grow && s.grow, className].filter(Boolean).join(" ");
  if (href) return <a href={href} className={cls} title={title}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} title={title}>{inner}</button>;
  return <div className={cls} title={title}>{inner}</div>;
}
