// Tyre degradation by compound across the season. One line per compound
// (SOFT / MEDIUM / HARD plus INTERMEDIATE/WET when relevant); X = race
// round, Y = median fuel-corrected deg in s/lap. Lower = better.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import { TC } from "../../lib/constants";
import type { TireDegRace } from "../../lib/seasonUtils";

interface Props { races: TireDegRace[]; height?: number; }

const MARGIN = { top: 14, right: 12, bottom: 36, left: 56 };
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

export default function TireDegByCompound({ races, height = 360 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { compounds, minRound, maxRound, yMin, yMax } = useMemo(() => {
    const series: Record<string, { round: number; deg: number; stints: number; slug: string }[]> = {};
    let minR = Infinity, maxR = -Infinity, lo = Infinity, hi = -Infinity;
    for (const r of races) {
      minR = Math.min(minR, r.round);
      maxR = Math.max(maxR, r.round);
      for (const c of r.compounds) {
        const v = c.medianDeg;
        (series[c.compound] ||= []).push({ round: r.round, deg: v, stints: c.stints, slug: r.slug });
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const compounds = Object.entries(series)
      .map(([compound, points]) => ({
        compound,
        points: points.sort((a, b) => a.round - b.round),
        latest: points[points.length - 1],
      }))
      .filter(c => c.points.length >= 1)
      .sort((a, b) => COMPOUND_ORDER.indexOf(a.compound) - COMPOUND_ORDER.indexOf(b.compound));
    return {
      compounds,
      minRound: minR,
      maxRound: maxR,
      yMin: Math.max(0, lo - 0.02),
      yMax: hi + 0.02,
    };
  }, [races]);

  if (!races.length || compounds.length === 0) {
    return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>No tyre deg data yet.</div>;
  }
  if (width === 0) return <div ref={wrapRef} style={{ height, fontFamily: F }} />;

  const innerW = Math.max(20, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const xRange = Math.max(1, maxRound - minRound);
  const yRange = (yMax - yMin) || 1;

  const xFor = (r: number) => MARGIN.left + ((r - minRound) / xRange) * innerW;
  const yFor = (g: number) => MARGIN.top + ((yMax - g) / yRange) * innerH;
  const colorOf = (compound: string) => TC[compound] ?? "#888";

  // Y axis ticks
  const yTicks: number[] = [];
  const step = yRange < 0.05 ? 0.01 : yRange < 0.2 ? 0.02 : 0.05;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(+v.toFixed(3));

  return (
    <div ref={wrapRef} style={{ width: "100%", fontFamily: F }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {yTicks.map(g => {
          const y = yFor(g);
          return (
            <g key={g}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
              <text x={MARGIN.left - 6} y={y + 3} fontSize={10} fontFamily={M} fill={C.textFaint} textAnchor="end">
                {g.toFixed(3)}
              </text>
            </g>
          );
        })}

        {races.map(r => {
          const everyN = width < 480 ? Math.ceil(races.length / 5) : Math.ceil(races.length / 12);
          if ((r.round - minRound) % everyN !== 0 && r.round !== maxRound) return null;
          return (
            <text key={r.round} x={xFor(r.round)} y={height - MARGIN.bottom + 16} fontSize={10} fontFamily={M} fill={C.textMute} textAnchor="middle">
              {r.slug.length > 8 ? r.slug.slice(0, 6) + "…" : r.slug}
            </text>
          );
        })}

        {compounds.map(c => {
          if (hidden.has(c.compound)) return null;
          const isActive = hovered === null || hovered === c.compound;
          const path = "M " + c.points.map(p => `${xFor(p.round).toFixed(1)},${yFor(p.deg).toFixed(1)}`).join(" L ");
          return (
            <path
              key={c.compound}
              d={path}
              fill="none"
              stroke={colorOf(c.compound)}
              strokeWidth={hovered === c.compound ? 3 : 2}
              strokeOpacity={isActive ? 0.95 : 0.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {compounds.map(c => {
          if (hidden.has(c.compound)) return null;
          return c.points.map(p => (
            <circle
              key={c.compound + "-" + p.round}
              cx={xFor(p.round)}
              cy={yFor(p.deg)}
              r={hovered === c.compound ? 4 : 2.5}
              fill={colorOf(c.compound)}
              opacity={hovered === null || hovered === c.compound ? 1 : 0.3}
            />
          ));
        })}
      </svg>

      <ul style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 6,
        listStyle: "none",
        padding: 0,
        margin: "12px 0 0",
      }}>
        {compounds.map(c => {
          const isHidden = hidden.has(c.compound);
          return (
            <li key={c.compound}>
              <button
                onMouseEnter={() => setHovered(c.compound)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHidden(prev => {
                  const next = new Set(prev);
                  next.has(c.compound) ? next.delete(c.compound) : next.add(c.compound);
                  return next;
                })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 6,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  color: isHidden ? C.textFaint : C.text,
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(c.compound), opacity: isHidden ? 0.25 : 1, flexShrink: 0 }} />
                <span>{c.compound}</span>
                <span style={{ marginLeft: "auto", color: C.textMute, fontFamily: M, fontSize: 11 }}>
                  {c.latest.deg.toFixed(3)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Median fuel-corrected degradation per stint (s/lap). Lower = the compound held up better that race weekend.
      </p>
    </div>
  );
}
