// Mirror of ConstructorPaceEvolution but driven by qualifying best laps:
// per race, each team's faster driver's best clean push lap becomes the
// "constructor's" qualifying time, and we track the gap to the fastest
// constructor over the season.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import type { ConstructorQualifyingRace } from "../../lib/seasonUtils";

interface Props {
  races: ConstructorQualifyingRace[];
  height?: number;
}

const MARGIN = { top: 18, right: 18, bottom: 36, left: 56 };
const TOP_N_DEFAULT = 3;

type Unit = "s" | "%";

interface Point {
  round: number;
  gapSec: number;
  gapPct: number;
  bestDriver: string;
  bestLap: number;
}

export default function ConstructorQualifyingEvolution({ races, height = 380 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(true);
  const [hoverRound, setHoverRound] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("s");

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { teams, minRound, maxRound, racesByRound, allMaxSec, allMaxPct } = useMemo(() => {
    const series: Record<string, Point[]> = {};
    let maxSec = 0;
    let maxPct = 0;
    let minRound = Infinity;
    let maxRound = -Infinity;
    const racesByRound: Record<number, ConstructorQualifyingRace> = {};
    for (const r of races) {
      racesByRound[r.round] = r;
      minRound = Math.min(minRound, r.round);
      maxRound = Math.max(maxRound, r.round);
      for (const t of r.teams) {
        const gapPct = r.fastestTeamBest > 0 ? (t.gapToFastest / r.fastestTeamBest) * 100 : 0;
        (series[t.team] ||= []).push({
          round: r.round,
          gapSec: t.gapToFastest,
          gapPct,
          bestDriver: t.bestDriver,
          bestLap: t.bestLap,
        });
        if (t.gapToFastest > maxSec) maxSec = t.gapToFastest;
        if (gapPct > maxPct) maxPct = gapPct;
      }
    }
    const teams = Object.entries(series)
      .map(([team, points]) => ({ team, points: points.sort((a, b) => a.round - b.round) }))
      .sort((a, b) => {
        const al = a.points[a.points.length - 1]?.gapSec ?? Infinity;
        const bl = b.points[b.points.length - 1]?.gapSec ?? Infinity;
        return al - bl;
      });
    return {
      teams,
      minRound,
      maxRound,
      racesByRound,
      allMaxSec: maxSec || 1,
      allMaxPct: maxPct || 1,
    };
  }, [races]);

  const topTeams = useMemo(() => new Set(teams.slice(0, TOP_N_DEFAULT).map(t => t.team)), [teams]);

  const isFocusedTeam = (team: string) =>
    !hidden.has(team) && (showAll || topTeams.has(team));

  // Q1/Q2 elimination boundary curves: 15th-best and 10th-best driver's
  // best lap, expressed as gap to the fastest constructor of that race.
  const cutoffSeries = useMemo(() => {
    const q1: { round: number; gap: number; pct: number }[] = [];
    const q2: { round: number; gap: number; pct: number }[] = [];
    for (const r of races) {
      if (r.fastestTeamBest > 0 && r.q1CutoffGap != null) {
        q1.push({
          round: r.round,
          gap: r.q1CutoffGap,
          pct: (r.q1CutoffGap / r.fastestTeamBest) * 100,
        });
      }
      if (r.fastestTeamBest > 0 && r.q2CutoffGap != null) {
        q2.push({
          round: r.round,
          gap: r.q2CutoffGap,
          pct: (r.q2CutoffGap / r.fastestTeamBest) * 100,
        });
      }
    }
    return {
      q1: q1.sort((a, b) => a.round - b.round),
      q2: q2.sort((a, b) => a.round - b.round),
    };
  }, [races]);

  const focusedMaxValue = useMemo(() => {
    let max = 0;
    for (const t of teams) {
      if (!isFocusedTeam(t.team)) continue;
      for (const p of t.points) {
        const v = unit === "s" ? p.gapSec : p.gapPct;
        if (v > max) max = v;
      }
    }
    // Always include the cutoff lines in the Y range so they're visible
    // reference lines regardless of which teams are focused.
    for (const p of cutoffSeries.q1) {
      const v = unit === "s" ? p.gap : p.pct;
      if (v > max) max = v;
    }
    for (const p of cutoffSeries.q2) {
      const v = unit === "s" ? p.gap : p.pct;
      if (v > max) max = v;
    }
    if (max === 0) max = unit === "s" ? allMaxSec : allMaxPct;
    return max;
  }, [teams, hidden, showAll, unit, allMaxSec, allMaxPct, cutoffSeries]);

  if (width === 0) {
    return <div ref={wrapRef} style={{ height, fontFamily: F }} />;
  }

  const innerW = Math.max(20, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const xRange = Math.max(1, maxRound - minRound);
  const yRange = focusedMaxValue * 1.08;

  const xFor = (round: number) => MARGIN.left + ((round - minRound) / xRange) * innerW;
  const yFor = (v: number) => MARGIN.top + (v / yRange) * innerH;
  const valueOf = (p: Point) => unit === "s" ? p.gapSec : p.gapPct;
  const teamColor = (team: string, idx: number) => TEAM_COLORS[team] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  const formatValue = (v: number) =>
    unit === "s" ? "+" + v.toFixed(v < 1 ? 3 : 2) : "+" + v.toFixed(2) + "%";
  const formatTick = (v: number) =>
    unit === "s" ? "+" + v.toFixed(2) + "s" : "+" + v.toFixed(1) + "%";

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
  const clipId = "cqe-clip";

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", fontFamily: F }}>
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
      }}>
        <div role="tablist" aria-label="Gap unit" style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: 2,
        }}>
          {(["s", "%"] as Unit[]).map(u => {
            const active = unit === u;
            return (
              <button
                key={u}
                role="tab"
                aria-selected={active}
                onClick={() => setUnit(u)}
                style={{
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: active ? C.text : C.textMute,
                  border: "none",
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  fontFamily: F,
                  cursor: "pointer",
                  borderRadius: 4,
                  textTransform: "uppercase",
                  minWidth: 32,
                }}
              >
                {u === "s" ? "Sec" : "%"}
              </button>
            );
          })}
        </div>
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
        <defs>
          <clipPath id={clipId}>
            <rect
              x={MARGIN.left}
              y={MARGIN.top - 2}
              width={innerW}
              height={innerH + 4}
            />
          </clipPath>
          <linearGradient id="cqe-plot-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.025)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          fill="url(#cqe-plot-bg)"
        />

        {gridYTicks(yRange).map(g => {
          const y = yFor(g);
          const isZero = g < 1e-6;
          return (
            <g key={g}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y}
                y2={y}
                stroke={isZero ? "rgba(34,197,94,0.28)" : "rgba(255,255,255,0.05)"}
                strokeWidth={isZero ? 1.2 : 1}
              />
              <text
                x={MARGIN.left - 8}
                y={y + 3}
                fontSize={10}
                fontFamily={M}
                fill={isZero ? "rgba(34,197,94,0.85)" : C.textFaint}
                textAnchor="end"
                fontWeight={isZero ? 700 : 400}
              >
                {isZero ? "pole car" : formatTick(g)}
              </text>
            </g>
          );
        })}

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

        {hoveredRace && (
          <line
            x1={tooltipX}
            x2={tooltipX}
            y1={MARGIN.top}
            y2={height - MARGIN.bottom}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={1}
            strokeDasharray="3 4"
            pointerEvents="none"
          />
        )}

        <g clipPath={`url(#${clipId})`}>
          {/* Q1/Q2 elimination boundary reference curves */}
          {(["q1", "q2"] as const).map(key => {
            const series = cutoffSeries[key];
            if (series.length === 0) return null;
            const color = key === "q1" ? "#EF4444" : "#F59E0B";
            const pts = series.map(p => ({
              x: xFor(p.round),
              y: yFor(unit === "s" ? p.gap : p.pct),
            }));
            return (
              <path
                key={key + "-cutoff"}
                d={smoothPath(pts)}
                fill="none"
                stroke={color}
                strokeWidth={1.4}
                strokeOpacity={0.55}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {teams.map((t, idx) => {
            if (hidden.has(t.team) || isFocusedTeam(t.team)) return null;
            const pts = t.points.map(p => ({ x: xFor(p.round), y: yFor(valueOf(p)) }));
            return (
              <path
                key={t.team + "-bg"}
                d={smoothPath(pts)}
                fill="none"
                stroke={teamColor(t.team, idx)}
                strokeWidth={1}
                strokeOpacity={hovered === t.team ? 0.7 : 0.18}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {teams.map((t, idx) => {
            if (hidden.has(t.team) || !isFocusedTeam(t.team)) return null;
            const pts = t.points.map(p => ({ x: xFor(p.round), y: yFor(valueOf(p)) }));
            const isActive = hovered === null || hovered === t.team;
            return (
              <path
                key={t.team}
                d={smoothPath(pts)}
                fill="none"
                stroke={teamColor(t.team, idx)}
                strokeWidth={hovered === t.team ? 3 : 2.25}
                strokeOpacity={isActive ? 0.95 : 0.3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {teams.map((t, idx) => {
            if (hidden.has(t.team) || !isFocusedTeam(t.team)) return null;
            const isActive = hovered === null || hovered === t.team;
            return (
              <g key={t.team + "-pts"} opacity={isActive ? 0.85 : 0.25}>
                {t.points.map(p => (
                  <circle
                    key={p.round}
                    cx={xFor(p.round)}
                    cy={yFor(valueOf(p))}
                    r={1.6}
                    fill={teamColor(t.team, idx)}
                  />
                ))}
              </g>
            );
          })}
        </g>

        {teams.map((t, idx) => {
          if (hidden.has(t.team) || !isFocusedTeam(t.team)) return null;
          const last = t.points[t.points.length - 1];
          if (!last) return null;
          return (
            <circle
              key={t.team + "-dot"}
              cx={xFor(last.round)}
              cy={yFor(valueOf(last))}
              r={hovered === t.team ? 4.5 : 3}
              fill={teamColor(t.team, idx)}
              stroke="#0a0a14"
              strokeWidth={1.5}
              opacity={hovered === null || hovered === t.team ? 1 : 0.4}
            />
          );
        })}

        {/* Q1/Q2 endpoint labels */}
        {(["q1", "q2"] as const).map(key => {
          const series = cutoffSeries[key];
          if (series.length === 0) return null;
          const last = series[series.length - 1];
          const color = key === "q1" ? "#EF4444" : "#F59E0B";
          const v = unit === "s" ? last.gap : last.pct;
          return (
            <g key={key + "-label"}>
              <text
                x={xFor(last.round) - 6}
                y={yFor(v) - 5}
                fontSize={9}
                fontFamily={M}
                fill={color}
                textAnchor="end"
                fontWeight={700}
                opacity={0.9}
              >
                {key.toUpperCase()} cut
              </text>
            </g>
          );
        })}

        {hoveredRace && hoveredRace.teams.map(tp => {
          if (hidden.has(tp.team)) return null;
          const isFocused = isFocusedTeam(tp.team);
          const pct = hoveredRace.fastestTeamBest > 0 ? (tp.gapToFastest / hoveredRace.fastestTeamBest) * 100 : 0;
          const v = unit === "s" ? tp.gapToFastest : pct;
          return (
            <circle
              key={"hover-" + tp.team}
              cx={tooltipX}
              cy={yFor(v)}
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

      {hoveredRace && (
        <div style={{
          position: "absolute",
          top: MARGIN.top + 6,
          [tooltipOnRight ? "left" : "right"]: tooltipOnRight
            ? Math.min(width - 240, tooltipX + 14)
            : Math.min(width - tooltipX + 14, width - 240),
          background: "rgba(8,8,16,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "10px 12px",
          minWidth: 220,
          maxWidth: 260,
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
            const pct = hoveredRace.fastestTeamBest > 0
              ? (tp.gapToFastest / hoveredRace.fastestTeamBest) * 100
              : 0;
            const primary = unit === "s" ? tp.gapToFastest : pct;
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
                  <span style={{ color: C.textFaint, fontFamily: M, fontSize: 10, marginLeft: 6 }}>
                    {tp.bestDriver}
                  </span>
                </span>
                <span style={{ fontFamily: M, fontVariantNumeric: "tabular-nums", color: tp.gapToFastest === 0 ? "#22c55e" : C.textDim, textAlign: "right" }}>
                  {tp.gapToFastest === 0 ? "pole" : formatValue(primary)}
                </span>
              </div>
            );
          })}

          {(hoveredRace.q1CutoffGap != null || hoveredRace.q2CutoffGap != null) && (
            <div style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontFamily: M,
              fontSize: 10,
              color: C.textMute,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}>
              {hoveredRace.q2CutoffGap != null && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#F59E0B" }}>Q2 cut (10th)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatValue(unit === "s" ? hoveredRace.q2CutoffGap : (hoveredRace.q2CutoffGap / hoveredRace.fastestTeamBest) * 100)}
                  </span>
                </div>
              )}
              {hoveredRace.q1CutoffGap != null && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#EF4444" }}>Q1 cut (15th)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatValue(unit === "s" ? hoveredRace.q1CutoffGap : (hoveredRace.q1CutoffGap / hoveredRace.fastestTeamBest) * 100)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
          const lastValue = lastPoint ? (unit === "s" ? lastPoint.gapSec : lastPoint.gapPct) : 0;
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
                <span style={{ marginLeft: "auto", color: C.textMute, fontFamily: M, fontSize: 11 }}>
                  {formatValue(lastValue)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Each line = the faster of the team's two drivers in qualifying, vs the fastest constructor of that race.
        Reflects raw single-lap car potential, less polluted by race-day variance than the race-pace chart.
        Dashed lines: <span style={{ color: "#F59E0B" }}>Q2 cut</span> (10th-fastest driver's gap to pole) and{" "}
        <span style={{ color: "#EF4444" }}>Q1 cut</span> (15th) — sitting above a dashed line in any round means
        the team's faster driver would have been eliminated there.
      </p>
    </div>
  );
}

function labelFor(r: ConstructorQualifyingRace): string {
  const name = r.meetingName.replace(/\s+(Grand Prix|GP)$/i, "").trim();
  return name.length > 10 ? name.slice(0, 9) + "…" : name;
}

function gridYTicks(yRange: number): number[] {
  const targetTicks = 5;
  const rawStep = yRange / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / mag;
  const niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = niceNorm * mag;
  const ticks: number[] = [];
  for (let g = 0; g <= yRange + step * 0.0001; g += step) ticks.push(+g.toFixed(4));
  return ticks;
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }
  const t = 0.18;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
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
  "Audi": "#E1224B",
  "Cadillac": "#F8C545",
};

const FALLBACK_COLORS = ["#a78bfa", "#06b6d4", "#f43f5e", "#84cc16", "#f97316", "#6366f1", "#ec4899"];
