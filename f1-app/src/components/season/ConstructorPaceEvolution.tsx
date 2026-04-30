// Full-page constructor pace evolution chart. Built mobile-first using a
// ResizeObserver — each team is a polyline; X is round number; Y is gap to
// fastest team in seconds (lower is better, so Y axis is inverted-ish).
//
// Uses SVG instead of canvas: this chart isn't perf-critical, gets one
// redraw per resize, and SVG makes touch interactions (legend tap to
// isolate) trivial.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import type { ConstructorPaceRace } from "../../lib/seasonUtils";

interface Props {
  races: ConstructorPaceRace[];
  height?: number;
}

const MARGIN = { top: 12, right: 12, bottom: 36, left: 44 };

export default function ConstructorPaceEvolution({ races, height = 360 }: Props) {
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

  // Build per-team series
  const { teams, maxGap, minRound, maxRound } = useMemo(() => {
    const series: Record<string, { round: number; gap: number; race: ConstructorPaceRace }[]> = {};
    let maxGap = 0;
    let minRound = Infinity;
    let maxRound = -Infinity;
    for (const r of races) {
      minRound = Math.min(minRound, r.round);
      maxRound = Math.max(maxRound, r.round);
      for (const t of r.teams) {
        (series[t.team] ||= []).push({ round: r.round, gap: t.gapToFastest, race: r });
        if (t.gapToFastest > maxGap) maxGap = t.gapToFastest;
      }
    }
    // Sort by latest gap (lowest = leader, drawn last)
    const teams = Object.entries(series)
      .map(([team, points]) => ({ team, points: points.sort((a, b) => a.round - b.round) }))
      .sort((a, b) => {
        const al = a.points[a.points.length - 1]?.gap ?? Infinity;
        const bl = b.points[b.points.length - 1]?.gap ?? Infinity;
        return al - bl;
      });
    return { teams, maxGap: maxGap || 1, minRound, maxRound };
  }, [races]);

  if (width === 0) {
    return <div ref={wrapRef} style={{ height, fontFamily: F }} />;
  }

  const innerW = Math.max(20, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const xRange = Math.max(1, maxRound - minRound);
  const yRange = maxGap * 1.05;

  const xFor = (round: number) => MARGIN.left + ((round - minRound) / xRange) * innerW;
  const yFor = (gap: number) => MARGIN.top + (gap / yRange) * innerH;

  const teamColor = (team: string, idx: number) => TEAM_COLORS[team] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  return (
    <div ref={wrapRef} style={{ width: "100%", fontFamily: F }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* Y gridlines */}
        {gridYTicks(yRange).map(g => {
          const y = yFor(g);
          return (
            <g key={g}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={MARGIN.left - 6} y={y + 3} fontSize={10} fontFamily={M} fill={C.textFaint} textAnchor="end">
                +{g.toFixed(2)}s
              </text>
            </g>
          );
        })}

        {/* X axis labels — round numbers, every Nth depending on width */}
        {races.map(r => {
          const everyN = width < 480 ? Math.ceil(races.length / 6) : Math.ceil(races.length / 12);
          if ((r.round - minRound) % everyN !== 0 && r.round !== maxRound) return null;
          const x = xFor(r.round);
          return (
            <text key={r.round} x={x} y={height - MARGIN.bottom + 16} fontSize={10} fontFamily={M} fill={C.textMute} textAnchor="middle">
              {r.slug.length > 8 ? r.slug.slice(0, 6) + "…" : r.slug}
            </text>
          );
        })}

        {/* Team lines */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team)) return null;
          const path = "M " + t.points.map(p => `${xFor(p.round).toFixed(1)},${yFor(p.gap).toFixed(1)}`).join(" L ");
          const isActive = hovered === null || hovered === t.team;
          return (
            <path
              key={t.team}
              d={path}
              fill="none"
              stroke={teamColor(t.team, idx)}
              strokeWidth={hovered === t.team ? 2.5 : 1.5}
              strokeOpacity={isActive ? 0.95 : 0.18}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Endpoint dots for the latest race */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team)) return null;
          const last = t.points[t.points.length - 1];
          if (!last) return null;
          return (
            <circle
              key={t.team + "-dot"}
              cx={xFor(last.round)}
              cy={yFor(last.gap)}
              r={hovered === t.team ? 4 : 2.5}
              fill={teamColor(t.team, idx)}
              opacity={hovered === null || hovered === t.team ? 1 : 0.3}
            />
          );
        })}
      </svg>

      {/* Legend — clickable to toggle visibility */}
      <ul style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 6,
        listStyle: "none",
        padding: 0,
        margin: "12px 0 0",
      }}>
        {teams.map((t, idx) => {
          const isHidden = hidden.has(t.team);
          return (
            <li key={t.team}>
              <button
                onMouseEnter={() => setHovered(t.team)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  setHidden(prev => {
                    const next = new Set(prev);
                    if (next.has(t.team)) next.delete(t.team); else next.add(t.team);
                    return next;
                  });
                }}
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
                  fontWeight: 500,
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: teamColor(t.team, idx),
                  opacity: isHidden ? 0.25 : 1,
                  flexShrink: 0,
                }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.team}
                </span>
                <span style={{ marginLeft: "auto", color: C.textMute, fontFamily: M, fontSize: 11 }}>
                  +{(t.points[t.points.length - 1]?.gap ?? 0).toFixed(2)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function gridYTicks(yRange: number): number[] {
  const step = yRange < 0.5 ? 0.1 : yRange < 1 ? 0.2 : yRange < 2 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let g = 0; g <= yRange; g += step) ticks.push(+g.toFixed(2));
  return ticks;
}

// Approximate F1 team brand colours. Falls back to the cycling palette
// for unknown teams.
const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#1E5BC6",
  "McLaren": "#FF8000",
  "Ferrari": "#DC0000",
  "Mercedes": "#27F4D2",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Williams": "#64C4FF",
  "RB": "#6692FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABD",
  "AlphaTauri": "#5E8FAA",
  "Alfa Romeo": "#900000",
};

const FALLBACK_COLORS = ["#a78bfa", "#06b6d4", "#f43f5e", "#84cc16", "#f97316", "#6366f1", "#ec4899"];
