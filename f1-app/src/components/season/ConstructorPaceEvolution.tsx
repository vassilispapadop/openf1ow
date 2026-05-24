// SVG (not canvas): one redraw per resize, free CSS responsiveness, and
// trivial click-to-isolate on the legend.
//
// "Top 3 by default" + hover crosshair so 11 overlapping lines stay
// readable: the top of the field is the visual story, and any race can
// be inspected to see the full ranking via the tooltip.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import type { ConstructorPaceRace } from "../../lib/seasonUtils";

interface Props {
  races: ConstructorPaceRace[];
  height?: number;
}

const MARGIN = { top: 14, right: 16, bottom: 36, left: 52 };
const TOP_N_DEFAULT = 3;

export default function ConstructorPaceEvolution({ races, height = 380 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [hoverRound, setHoverRound] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Build per-team series, sorted by latest gap (leader first).
  const { teams, maxGap, minRound, maxRound, racesByRound } = useMemo(() => {
    const series: Record<string, { round: number; gap: number }[]> = {};
    let maxGap = 0;
    let minRound = Infinity;
    let maxRound = -Infinity;
    const racesByRound: Record<number, ConstructorPaceRace> = {};
    for (const r of races) {
      racesByRound[r.round] = r;
      minRound = Math.min(minRound, r.round);
      maxRound = Math.max(maxRound, r.round);
      for (const t of r.teams) {
        (series[t.team] ||= []).push({ round: r.round, gap: t.gapToFastest });
        if (t.gapToFastest > maxGap) maxGap = t.gapToFastest;
      }
    }
    const teams = Object.entries(series)
      .map(([team, points]) => ({ team, points: points.sort((a, b) => a.round - b.round) }))
      .sort((a, b) => {
        const al = a.points[a.points.length - 1]?.gap ?? Infinity;
        const bl = b.points[b.points.length - 1]?.gap ?? Infinity;
        return al - bl;
      });
    return { teams, maxGap: maxGap || 1, minRound, maxRound, racesByRound };
  }, [races]);

  const topTeams = useMemo(() => new Set(teams.slice(0, TOP_N_DEFAULT).map(t => t.team)), [teams]);

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

  const isFocusedTeam = (team: string) =>
    !hidden.has(team) && (showAll || topTeams.has(team));

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    if (x < MARGIN.left - 8 || x > width - MARGIN.right + 8) {
      setHoverRound(null);
      return;
    }
    const rNum = minRound + ((x - MARGIN.left) / innerW) * xRange;
    let best = races[0]?.round ?? null;
    let bestD = Infinity;
    for (const r of races) {
      const d = Math.abs(r.round - rNum);
      if (d < bestD) { bestD = d; best = r.round; }
    }
    setHoverRound(best);
  };

  const hoveredRace = hoverRound != null ? racesByRound[hoverRound] : null;
  const tooltipX = hoverRound != null ? xFor(hoverRound) : 0;
  const tooltipOnRight = tooltipX < width / 2;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", fontFamily: F }}>
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 6,
      }}>
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            background: "transparent",
            border: "1px solid " + (showAll ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"),
            color: showAll ? C.text : C.textMute,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: F,
            cursor: "pointer",
          }}
        >
          {showAll ? "Top 3 only" : "Show all teams"}
        </button>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
        onMouseMove={handleSvgMove}
        onMouseLeave={() => setHoverRound(null)}
      >
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

        {/* X axis labels — full meeting name (truncated) every Nth race */}
        {races.map(r => {
          const everyN = width < 480 ? Math.ceil(races.length / 5) : Math.ceil(races.length / 10);
          if ((r.round - minRound) % everyN !== 0 && r.round !== maxRound) return null;
          const x = xFor(r.round);
          const label = labelFor(r);
          return (
            <text key={r.round} x={x} y={height - MARGIN.bottom + 16} fontSize={10} fontFamily={M} fill={C.textMute} textAnchor="middle">
              {label}
            </text>
          );
        })}

        {/* Hover crosshair */}
        {hoveredRace && (
          <line
            x1={tooltipX}
            x2={tooltipX}
            y1={MARGIN.top}
            y2={height - MARGIN.bottom}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}

        {/* Background lines (dimmed teams) drawn first so highlights sit on top */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team) || isFocusedTeam(t.team)) return null;
          const path = "M " + t.points.map(p => `${xFor(p.round).toFixed(1)},${yFor(p.gap).toFixed(1)}`).join(" L ");
          return (
            <path
              key={t.team + "-bg"}
              d={path}
              fill="none"
              stroke={teamColor(t.team, idx)}
              strokeWidth={1}
              strokeOpacity={hovered === t.team ? 0.7 : 0.18}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Foreground (focused) team lines */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team) || !isFocusedTeam(t.team)) return null;
          const path = "M " + t.points.map(p => `${xFor(p.round).toFixed(1)},${yFor(p.gap).toFixed(1)}`).join(" L ");
          const isActive = hovered === null || hovered === t.team;
          return (
            <path
              key={t.team}
              d={path}
              fill="none"
              stroke={teamColor(t.team, idx)}
              strokeWidth={hovered === t.team ? 3 : 2}
              strokeOpacity={isActive ? 0.95 : 0.35}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Endpoint dots for focused teams */}
        {teams.map((t, idx) => {
          if (hidden.has(t.team) || !isFocusedTeam(t.team)) return null;
          const last = t.points[t.points.length - 1];
          if (!last) return null;
          return (
            <circle
              key={t.team + "-dot"}
              cx={xFor(last.round)}
              cy={yFor(last.gap)}
              r={hovered === t.team ? 4.5 : 3}
              fill={teamColor(t.team, idx)}
              stroke="#0a0a14"
              strokeWidth={1.5}
              opacity={hovered === null || hovered === t.team ? 1 : 0.4}
            />
          );
        })}

        {/* Per-team hover dots at the hovered round */}
        {hoveredRace && hoveredRace.teams.map((tp, i) => {
          if (hidden.has(tp.team)) return null;
          const isFocused = isFocusedTeam(tp.team);
          return (
            <circle
              key={"hover-" + tp.team}
              cx={tooltipX}
              cy={yFor(tp.gapToFastest)}
              r={isFocused ? 3.5 : 2}
              fill={teamColor(tp.team, teams.findIndex(x => x.team === tp.team))}
              stroke="#0a0a14"
              strokeWidth={1}
              opacity={isFocused ? 1 : 0.5}
              pointerEvents="none"
            />
          );
        })}
      </svg>

      {/* Floating tooltip on hover */}
      {hoveredRace && (
        <div style={{
          position: "absolute",
          top: MARGIN.top + 6,
          [tooltipOnRight ? "left" : "right"]: tooltipOnRight
            ? Math.min(width - 220, tooltipX + 14)
            : Math.min(width - tooltipX + 14, width - 220),
          background: "rgba(8,8,16,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "10px 12px",
          minWidth: 200,
          maxWidth: 240,
          fontSize: 11,
          fontFamily: F,
          color: C.text,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none",
          zIndex: 5,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: C.textMute,
            marginBottom: 6,
            textTransform: "uppercase",
          }}>
            Round {hoveredRace.round} · {hoveredRace.meetingName}
          </div>
          {hoveredRace.teams.map((tp, i) => {
            const idx = teams.findIndex(x => x.team === tp.team);
            const pct = hoveredRace.fastestTeamMedian > 0
              ? (tp.gapToFastest / hoveredRace.fastestTeamMedian) * 100
              : 0;
            return (
              <div key={tp.team} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 0",
                opacity: hidden.has(tp.team) ? 0.35 : 1,
              }}>
                <span style={{ color: C.textFaint, fontFamily: M, fontSize: 10, width: 16 }}>
                  {i + 1}
                </span>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: teamColor(tp.team, idx),
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tp.team}
                </span>
                <span style={{ fontFamily: M, fontVariantNumeric: "tabular-nums", color: tp.gapToFastest === 0 ? "#22c55e" : C.textDim, textAlign: "right" }}>
                  {tp.gapToFastest === 0 ? "fastest" : (
                    <>
                      +{tp.gapToFastest.toFixed(3)}
                      <span style={{ color: C.textFaint, fontSize: 10, marginLeft: 4 }}>
                        +{pct.toFixed(2)}%
                      </span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend — clickable to toggle visibility */}
      <ul style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 6,
        listStyle: "none",
        padding: 0,
        margin: "12px 0 0",
      }}>
        {teams.map((t, idx) => {
          const isHidden = hidden.has(t.team);
          const focused = isFocusedTeam(t.team);
          const lastPoint = t.points[t.points.length - 1];
          const lastRace = lastPoint ? racesByRound[lastPoint.round] : undefined;
          const lastGap = lastPoint?.gap ?? 0;
          const lastPct = lastRace && lastRace.fastestTeamMedian > 0
            ? (lastGap / lastRace.fastestTeamMedian) * 100
            : 0;
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
                  color: isHidden ? C.textFaint : (focused ? C.text : C.textDim),
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: focused ? 600 : 400,
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span style={{ color: C.textFaint, fontFamily: M, fontSize: 10, minWidth: 16 }}>
                  {idx + 1}
                </span>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: teamColor(t.team, idx),
                  opacity: isHidden ? 0.25 : (focused ? 1 : 0.45),
                  flexShrink: 0,
                }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.team}
                </span>
                <span style={{ marginLeft: "auto", color: C.textMute, fontFamily: M, fontSize: 11, display: "flex", gap: 4, alignItems: "baseline" }}>
                  <span>+{lastGap.toFixed(2)}</span>
                  <span style={{ color: C.textFaint, fontSize: 10 }}>+{lastPct.toFixed(2)}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Each line = a constructor's median lap-time gap to the fastest car of that race.
        Hover the chart for the full ranking at any round.
      </p>
    </div>
  );
}

function labelFor(r: ConstructorPaceRace): string {
  const name = r.meetingName.replace(/\s+(Grand Prix|GP)$/i, "").trim();
  return name.length > 10 ? name.slice(0, 9) + "…" : name;
}

function gridYTicks(yRange: number): number[] {
  const step = yRange < 0.5 ? 0.1 : yRange < 1 ? 0.2 : yRange < 2 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let g = 0; g <= yRange; g += step) ticks.push(+g.toFixed(2));
  return ticks;
}

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

const FALLBACK_COLORS = ["#a78bfa", "#06b6d4", "#f43f5e", "#84cc16", "#f97316", "#6366f1", "#ec4899"];
