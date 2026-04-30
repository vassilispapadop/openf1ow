// Shared visual shell for the homepage trend tiles. Keeps the layout
// identical across tiles so the row reads as a row, not a collage.

import type { ReactNode } from "react";
import { F, C, R } from "../../lib/styles";

interface Props {
  label: string;          // e.g. "CONSTRUCTOR PACE"
  headline: string;       // e.g. "McLaren +0.31s"
  detail?: string;        // e.g. "vs. Red Bull, last 5 races"
  delta?: { value: string; positive?: boolean };  // e.g. "+0.04s/race"
  spark?: ReactNode;      // <Sparkline />
  href?: string;
}

export default function TrendTile({ label, headline, detail, delta, spark, href }: Props) {
  const inner = (
    <>
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, letterSpacing: "0.12em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: "clamp(20px, 3.2vw, 26px)",
        fontWeight: 800,
        color: C.text,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      }}>
        {headline}
      </div>
      {detail && (
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
          {detail}
        </div>
      )}
      {delta && (
        <div style={{
          fontSize: 11,
          color: delta.positive ? C.pos : C.neg,
          fontWeight: 600,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}>
          {delta.value}
        </div>
      )}
      {spark && <div style={{ marginTop: 14 }}>{spark}</div>}
    </>
  );

  const wrap: React.CSSProperties = {
    background: C.surface,
    border: "1px solid " + C.border,
    borderRadius: R.lg,
    padding: 18,
    fontFamily: F,
    minHeight: 156,
    display: "flex",
    flexDirection: "column",
    transition: "border-color 0.15s ease",
  };

  if (href) {
    return (
      <a href={href} className="card-glow" style={{ ...wrap, color: "inherit", textDecoration: "none" }}>
        {inner}
      </a>
    );
  }
  return <div style={wrap}>{inner}</div>;
}
