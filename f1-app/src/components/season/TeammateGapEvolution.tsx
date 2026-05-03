// Teammate-gap-over-the-season chart. Each team is a line: positive when
// the first-seen faster driver is still ahead, negative when teammates
// have flipped — the sign change is the visual story.
//
// Same skeleton as ConstructorPaceEvolution but with team-flip handling
// in the series builder.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import type { TeammateGapRace } from "../../lib/seasonUtils";

interface Props { races: TeammateGapRace[]; height?: number; }

const MARGIN = { top: 14, right: 12, bottom: 36, left: 56 };

const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#1E5BC6",
  "McLaren": "#FF8000",
  "Ferrari": "#DC0000",
  "Mercedes": "#27F4D2",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Williams": "#64C4FF",
  "RB": "#6692FF",
  "Racing Bulls": "#6692FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABD",
  "AlphaTauri": "#5E8FAA",
  "Alfa Romeo": "#900000",
  "Audi": "#13141A",
  "Cadillac": "#0E1A30",
};
const FALLBACK = ["#a78bfa", "#06b6d4", "#f43f5e", "#84cc16", "#f97316", "#6366f1", "#ec4899"];

export default function TeammateGapEvolution({ races, height = 360 }: Props) {
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

  // For each team, build a signed series. Sign convention: + when the
  // first-seen faster driver is still ahead, − after they've flipped.
  const { teams, minRound, maxRound, yMin, yMax } = useMemo(() => {
    const series: Record<string, {
      round: number;
      gap: number;          // signed
      raw: number;          // |gap|
      faster: string;
      slower: string;
      slug: string;
    }[]> = {};
    const teamFaster: Record<string, string> = {};
    let minR = Infinity, maxR = -Infinity, lo = 0, hi = 0;

    for (const r of races) {
      minR = Math.min(minR, r.round);
      maxR = Math.max(maxR, r.round);
      for (const t of r.teams) {
        if (!teamFaster[t.team]) teamFaster[t.team] = t.faster;
        const sign = t.faster === teamFaster[t.team] ? 1 : -1;
        const v = sign * t.gap;
        (series[t.team] ||= []).push({
          round: r.round,
          gap: v,
          raw: t.gap,
          faster: t.faster,
          slower: t.slower,
          slug: r.slug,
        });
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }

    const teams = Object.entries(series)
      .map(([team, points]) => ({
        team,
        points: points.sort((a, b) => a.round - b.round),
        latest: points[points.length - 1],
      }))
      .filter(t => t.points.length >= 2)
      .sort((a, b) => Math.abs(b.latest.gap) - Math.abs(a.latest.gap));

    return { teams, minRound: minR, maxRound: maxR, yMin: lo - 0.05, yMax: hi + 0.05 };
  }, [races]);

  if (!races.length || teams.length === 0) {
    return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>Need at least 2 races with teammate-comparable laps.</div>;
  }

  if (width === 0) return <div ref={wrapRef} style={{ height, fontFamily: F }} />;

  const innerW = Math.max(20, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const xRange = Math.max(1, maxRound - minRound);
  const yRange = yMax - yMin || 1;

  const xFor = (r: number) => MARGIN.left + ((r - minRound) / xRange) * innerW;
  const yFor = (g: number) => MARGIN.top + ((yMax - g) / yRange) * innerH;
  const colorOf = (team: string, idx: number) => TEAM_COLORS[team] ?? FALLBACK[idx % FALLBACK.length];

  // Y axis ticks: round to sensible intervals
  const yTicks: number[] = [];
  const step = yRange < 0.4 ? 0.1 : yRange < 1 ? 0.2 : 0.5;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(+v.toFixed(2));

  return (
    <div ref={wrapRef} style={{ width: "100%", fontFamily: F }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* Zero line — flip boundary */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {/* Y gridlines */}
        {yTicks.map(g => {
          if (Math.abs(g) < 1e-6) return null;
          const y = yFor(g);
          return (
            <g key={g}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
              <text x={MARGIN.left - 6} y={y + 3} fontSize={10} fontFamily={M} fill={C.textFaint} textAnchor="end">
                {g >= 0 ? "+" : ""}{g.toFixed(2)}s
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {races.map(r => {
          const everyN = width < 480 ? Math.ceil(races.length / 5) : Math.ceil(races.length / 12);
          if ((r.round - minRound) % everyN !== 0 && r.round !== maxRound) return null;
          return (
            <text key={r.round} x={xFor(r.round)} y={height - MARGIN.bottom + 16} fontSize={10} fontFamily={M} fill={C.textMute} textAnchor="middle">
              {r.slug.length > 8 ? r.slug.slice(0, 6) + "…" : r.slug}
            </text>
          );
        })}

        {/* Team lines */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team)) return null;
          const isActive = hovered === null || hovered === t.team;
          const path = "M " + t.points.map(p => `${xFor(p.round).toFixed(1)},${yFor(p.gap).toFixed(1)}`).join(" L ");
          return (
            <path
              key={t.team}
              d={path}
              fill="none"
              stroke={colorOf(t.team, idx)}
              strokeWidth={hovered === t.team ? 2.5 : 1.5}
              strokeOpacity={isActive ? 0.95 : 0.18}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Endpoint dots */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team)) return null;
          const last = t.points[t.points.length - 1];
          return (
            <circle
              key={t.team + "-dot"}
              cx={xFor(last.round)}
              cy={yFor(last.gap)}
              r={hovered === t.team ? 4 : 2.5}
              fill={colorOf(t.team, idx)}
              opacity={hovered === null || hovered === t.team ? 1 : 0.3}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <ul style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 6,
        listStyle: "none",
        padding: 0,
        margin: "12px 0 0",
      }}>
        {teams.map((t, idx) => {
          const isHidden = hidden.has(t.team);
          const sign = t.latest.gap >= 0 ? "+" : "";
          return (
            <li key={t.team}>
              <button
                onMouseEnter={() => setHovered(t.team)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHidden(prev => {
                  const next = new Set(prev);
                  next.has(t.team) ? next.delete(t.team) : next.add(t.team);
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
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(t.team, idx), opacity: isHidden ? 0.25 : 1, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.team}
                </span>
                <span style={{ marginLeft: "auto", color: C.textMute, fontFamily: M, fontSize: 11 }}>
                  {sign}{t.latest.gap.toFixed(3)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Positive = the first-seen faster driver is still ahead; negative = teammates have flipped (the OTHER driver is now faster).
        The dashed line is the flip boundary.
      </p>
    </div>
  );
}
