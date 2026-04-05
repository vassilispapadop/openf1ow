import React from "react";
import { F, M } from "../../lib/styles";
import { ft1, ft3, podiumColor } from "../../lib/format";
import useTooltip from "./useTooltip";

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const TEAM_ABBR: Record<string, string> = {
  "Mercedes": "MER", "McLaren": "MCL", "Ferrari": "FER",
  "Red Bull Racing": "RBR", "Alpine": "ALP", "Audi": "AUD",
  "Racing Bulls": "RCB", "Haas F1 Team": "HAS", "Williams": "WIL",
  "Cadillac": "CAD", "Aston Martin": "AMR", "Kick Sauber": "SAU",
  "BWT Alpine F1 Team": "ALP", "Scuderia Ferrari": "FER",
  "Oracle Red Bull Racing": "RBR", "MoneyGram Haas F1 Team": "HAS",
};

export function teamAbbr(name: string): string {
  if (TEAM_ABBR[name]) return TEAM_ABBR[name];
  return name.slice(0, 3).toUpperCase();
}

function BoxPlotChart({ rows }: {
  rows: { label: string; color: string; times: number[] }[];
}) {
  const { containerRef, show, hide, el } = useTooltip();

  if (!rows.length) return null;

  const stats = rows.map(r => {
    const s = [...r.times].sort((a, b) => a - b);
    return {
      ...r,
      p10: percentile(s, 10),
      p25: percentile(s, 25),
      median: percentile(s, 50),
      p75: percentile(s, 75),
      p90: percentile(s, 90),
      count: s.length,
    };
  });

  const globalMin = Math.min(...stats.map(s => s.p10));
  const globalMax = Math.max(...stats.map(s => s.p90));
  const pad = (globalMax - globalMin) * 0.08 || 0.5;
  const xMin = globalMin - pad;
  const xMax = globalMax + pad;
  const xRange = xMax - xMin;

  const toX = (v: number) => ((v - xMin) / xRange) * 100;
  const ROW_H = 28;
  const fastestMedian = stats[0]?.median || 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {el}
      {/* X-axis labels */}
      <div style={{ position: "relative", height: 18, marginLeft: 72, marginBottom: 4 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const v = xMin + (xRange * (i + 0.5)) / 5;
          return (
            <span key={i} style={{
              position: "absolute",
              left: toX(v) + "%",
              transform: "translateX(-50%)",
              fontSize: 9, fontFamily: M, color: "#3d4f6f",
            }}>{ft1(v)}</span>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "2px 0" }}>
        {stats.map((s, i) => {
          const gap = s.median - fastestMedian;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "default" }}
              onMouseMove={e => show(e, (
                <div>
                  <div style={{ fontWeight: 700, color: "#" + s.color, marginBottom: 4, fontFamily: F }}>{s.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
                    <span style={{ color: "#5a5a6e" }}>P10</span><span>{ft3(s.p10)}</span>
                    <span style={{ color: "#5a5a6e" }}>P25</span><span>{ft3(s.p25)}</span>
                    <span style={{ color: "#5a5a6e" }}>Median</span><span style={{ fontWeight: 700 }}>{ft3(s.median)}</span>
                    <span style={{ color: "#5a5a6e" }}>P75</span><span>{ft3(s.p75)}</span>
                    <span style={{ color: "#5a5a6e" }}>P90</span><span>{ft3(s.p90)}</span>
                    <span style={{ color: "#5a5a6e" }}>Laps</span><span>{s.count}</span>
                  </div>
                </div>
              ))}
              onMouseLeave={hide}>
              <span style={{
                fontWeight: 800, fontSize: 11, color: podiumColor(i),
                fontFamily: F, minWidth: 18, textAlign: "right",
              }}>{i + 1}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: F,
                color: "#" + s.color, minWidth: 40,
              }}>{s.label}</span>
              {/* Box plot area */}
              <div style={{ flex: 1, position: "relative", height: ROW_H }}>
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: ROW_H, borderRadius: 3,
                  background: "rgba(255,255,255,0.02)",
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 1,
                  left: toX(s.p10) + "%",
                  width: (toX(s.p90) - toX(s.p10)) + "%",
                  height: 2,
                  background: "#" + s.color,
                  opacity: 0.3,
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 5,
                  left: toX(s.p10) + "%",
                  width: 1, height: 10,
                  background: "#" + s.color,
                  opacity: 0.4,
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 5,
                  left: toX(s.p90) + "%",
                  width: 1, height: 10,
                  background: "#" + s.color,
                  opacity: 0.4,
                }} />
                <div style={{
                  position: "absolute",
                  top: 4,
                  left: toX(s.p25) + "%",
                  width: Math.max(2, toX(s.p75) - toX(s.p25)) + "%",
                  height: ROW_H - 8,
                  borderRadius: 3,
                  background: "#" + s.color,
                  opacity: 0.3,
                  border: "1px solid #" + s.color,
                }} />
                <div style={{
                  position: "absolute",
                  top: 2,
                  left: toX(s.median) + "%",
                  width: 2, height: ROW_H - 4,
                  borderRadius: 1,
                  background: "#" + s.color,
                }} />
              </div>
              <div style={{ minWidth: 80, textAlign: "right" }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: "#e8e8ec" }}>
                  {ft3(s.median)}
                </span>
                {i > 0 && (
                  <span style={{ fontSize: 9, fontFamily: M, color: "#ef4444", marginLeft: 6 }}>
                    +{gap.toFixed(3)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", gap: 16, marginTop: 10, paddingLeft: 72,
        fontSize: 9, color: "#5a5a6e", fontFamily: F,
      }}>
        <span>Whiskers: P10-P90</span>
        <span>Box: P25-P75</span>
        <span>Line: Median</span>
      </div>
    </div>
  );
}

export default BoxPlotChart;
