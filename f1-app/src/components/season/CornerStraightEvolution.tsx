// Corner, fast-curve and straight gap, race by race — the same shape as the
// constructor pace and qualifying evolution charts, but on one part of the lap
// at a time. Artifacts built before fast curves were split out only carry the
// two-way split, so the curves mode is offered only when the data has it.
//
// The one structural difference: these gaps are signed. A team can be *faster*
// than the weekend's reference car through the corners while losing the lap
// overall, so the Y axis spans both sides of zero rather than hanging down
// from the leader. Above the zero line = quicker than the reference through
// that part of the lap.

import { useEffect, useMemo, useRef, useState } from "react";
import { F, M, C } from "../../lib/styles";
import { TEAM_COLORS, TEAM_FALLBACK_COLORS, SECTION_COLORS } from "../../lib/constants";
import { smoothPath, signedYTicks, shortMeetingName } from "../../lib/chartUtils";
import type { CornerStraightRace } from "../../lib/seasonUtils";

interface Props {
  races: CornerStraightRace[];
  height?: number;
}

const MARGIN = { top: 18, right: 18, bottom: 36, left: 62 };
const TOP_N_DEFAULT = 3;

type Mode = "corners" | "curves" | "straights";
/** Seconds, or the gap as a share of the reference car's time through that
 *  part of the lap. Percent is the more honest cross-circuit read here:
 *  Monaco's corners take ~44 s and Monza's ~16 s, so a tenth means very
 *  different things at the two. */
type Unit = "s" | "%";

const MODE_COLOR: Record<Mode, string> = {
  corners: SECTION_COLORS.corner,
  curves: SECTION_COLORS.curve,
  straights: SECTION_COLORS.straight,
};
const MODE_LABEL: Record<Mode, string> = { corners: "Corners", curves: "Fast curves", straights: "Straights" };

interface Point {
  round: number;
  gap: Record<Mode, number>;   // seconds vs the reference, per part of the lap
  pct: Record<Mode, number>;   // the same as a share of the reference's own time there
  driver: string;
  lapGap: number;
}

type TeamPoint = CornerStraightRace["teams"][number];

/** A team's gap through one part of the lap; curves read 0 in two-way artifacts. */
function gapOf(t: TeamPoint, m: Mode): number {
  return m === "corners" ? t.cornerGap : m === "curves" ? (t.curveGap ?? 0) : t.straightGap;
}

export default function CornerStraightEvolution({ races, height = 380 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(true);
  const [hoverRound, setHoverRound] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("corners");
  const [unit, setUnit] = useState<Unit>("s");

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const ordered = useMemo(() => [...races].sort((a, b) => a.round - b.round), [races]);

  const hasCurves = useMemo(() => ordered.some(r => r.teams.some(t => t.curveGap != null)), [ordered]);
  const modes: Mode[] = hasCurves ? ["corners", "curves", "straights"] : ["corners", "straights"];

  const { teams, minRound, maxRound, racesByRound } = useMemo(() => {
    const series: Record<string, Point[]> = {};
    let minRound = Infinity;
    let maxRound = -Infinity;
    const racesByRound: Record<number, CornerStraightRace> = {};
    for (const r of ordered) {
      racesByRound[r.round] = r;
      minRound = Math.min(minRound, r.round);
      maxRound = Math.max(maxRound, r.round);
      // The reference car's own times through each part of the lap are what
      // the percentages are a share of.
      const ref = refTimesFor(r);
      const share = (t: TeamPoint, m: Mode) => (ref[m] > 0 ? (gapOf(t, m) / ref[m]) * 100 : 0);
      for (const t of r.teams) {
        (series[t.team] ||= []).push({
          round: r.round,
          gap: { corners: gapOf(t, "corners"), curves: gapOf(t, "curves"), straights: gapOf(t, "straights") },
          pct: { corners: share(t, "corners"), curves: share(t, "curves"), straights: share(t, "straights") },
          driver: t.driver,
          lapGap: t.gapToFastest,
        });
      }
    }
    // Ordered by season form so the legend and the top-3 default match the
    // other charts on the page.
    const teams = Object.entries(series)
      .map(([team, points]) => {
        const sorted = points.sort((a, b) => a.round - b.round);
        const meanLapGap = sorted.reduce((s, p) => s + p.lapGap, 0) / sorted.length;
        return { team, points: sorted, meanLapGap };
      })
      .sort((a, b) => a.meanLapGap - b.meanLapGap);
    return { teams, minRound, maxRound, racesByRound };
  }, [ordered]);

  const topTeams = useMemo(() => new Set(teams.slice(0, TOP_N_DEFAULT).map(t => t.team)), [teams]);
  const isFocusedTeam = (team: string) => !hidden.has(team) && (showAll || topTeams.has(team));

  const valueOf = (p: Point) => (unit === "s" ? p.gap[mode] : p.pct[mode]);

  // Scale to whatever is on screen, but always keep zero in frame — it's the
  // line that says "level with the reference car".
  const { yMin, yMax } = useMemo(() => {
    let lo = 0, hi = 0;
    let any = false;
    for (const t of teams) {
      if (!isFocusedTeam(t.team)) continue;
      for (const p of t.points) {
        const v = valueOf(p);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        any = true;
      }
    }
    if (!any) { lo = unit === "s" ? -0.5 : -1; hi = unit === "s" ? 0.5 : 1; }
    const pad = Math.max(unit === "s" ? 0.05 : 0.1, (hi - lo) * 0.08);
    return { yMin: lo - pad, yMax: hi + pad };
  }, [teams, hidden, showAll, mode, unit]);

  if (!races.length) {
    return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>No corner/straight data yet.</div>;
  }
  if (width === 0) return <div ref={wrapRef} style={{ height, fontFamily: F }} />;

  const innerW = Math.max(20, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const xRange = Math.max(1, maxRound - minRound);
  const yRange = (yMax - yMin) || 1;

  const xFor = (round: number) => MARGIN.left + ((round - minRound) / xRange) * innerW;
  // Quicker-than-reference at the top, slower hanging below it — the same
  // orientation as the pace and qualifying charts, where the leader is the
  // top line. Note this means y grows with the gap, unlike a plain plot.
  const yFor = (v: number) => MARGIN.top + ((v - yMin) / yRange) * innerH;
  const teamColor = (team: string, idx: number) => TEAM_COLORS[team] ?? TEAM_FALLBACK_COLORS[idx % TEAM_FALLBACK_COLORS.length];
  const sign = (v: number) => v > 0 ? "+" : v < 0 ? "−" : "";
  const fmt = (v: number) =>
    unit === "s"
      ? sign(v) + Math.abs(v).toFixed(v === 0 ? 2 : 3)
      : sign(v) + Math.abs(v).toFixed(2) + "%";
  const axisLabel = (v: number) => unit === "s" ? fmt(v) + "s" : fmt(v);

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    if (x < MARGIN.left - 8 || x > width - MARGIN.right + 8) { setHoverRound(null); return; }
    const rNum = minRound + ((x - MARGIN.left) / innerW) * xRange;
    let best = ordered[0]?.round ?? null;
    let bestD = Infinity;
    for (const r of ordered) {
      const d = Math.abs(r.round - rNum);
      if (d < bestD) { bestD = d; best = r.round; }
    }
    setHoverRound(best);
  };

  const hoveredRace = hoverRound != null ? racesByRound[hoverRound] : null;
  const tooltipX = hoverRound != null ? xFor(hoverRound) : 0;
  const tooltipOnRight = tooltipX < width / 2;
  const clipId = "cse-clip";

  // Values for the hovered round, in whichever unit is on screen.
  const hoverRef = hoveredRace ? refTimesFor(hoveredRace) : { corners: 0, curves: 0, straights: 0 };
  const hoverValue = (tp: TeamPoint) => {
    const gap = gapOf(tp, mode);
    if (unit === "s") return gap;
    const base = hoverRef[mode];
    return base > 0 ? (gap / base) * 100 : 0;
  };

  // Ranked for the tooltip by the part of the lap currently on screen.
  const hoverRanked = hoveredRace
    ? [...hoveredRace.teams].sort((a, b) => gapOf(a, mode) - gapOf(b, mode))
    : [];

  const sectionSummary = (r: CornerStraightRace): string =>
    mode === "corners"
      ? `${r.cornerCount} sections, ${r.cornerDistance.toLocaleString()} m`
      : mode === "curves"
        ? `${r.curveCount ?? 0} sections, ${(r.curveDistance ?? 0).toLocaleString()} m`
        : `${r.straightCount} sections, ${r.straightDistance.toLocaleString()} m`;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", fontFamily: F }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginBottom: 8 }}>
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
              >{u === "s" ? "Sec" : "%"}</button>
            );
          })}
        </div>
        <div role="tablist" aria-label="Lap section" style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: 2,
        }}>
          {modes.map(m => {
            const active = mode === m;
            return (
              <button
                key={m}
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m)}
                style={{
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: active ? MODE_COLOR[m] : C.textMute,
                  border: "none",
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  fontFamily: F,
                  cursor: "pointer",
                  borderRadius: 4,
                  textTransform: "uppercase",
                }}
              >{MODE_LABEL[m]}</button>
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
        >{showAll ? "Top 3 only" : "Show all teams"}</button>
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
            <rect x={MARGIN.left} y={MARGIN.top - 2} width={innerW} height={innerH + 4} />
          </clipPath>
          <linearGradient id="cse-plot-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.025)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        <rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} fill="url(#cse-plot-bg)" />

        {signedYTicks(yMin, yMax).map(g => {
          const y = yFor(g);
          if (y < MARGIN.top - 1 || y > height - MARGIN.bottom + 1) return null;
          const isZero = Math.abs(g) < 1e-9;
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
                {isZero ? "reference" : axisLabel(g)}
              </text>
            </g>
          );
        })}

        {ordered.map(r => {
          const everyN = width < 480 ? Math.ceil(ordered.length / 5) : Math.ceil(ordered.length / 10);
          if ((r.round - minRound) % everyN !== 0 && r.round !== maxRound) return null;
          return (
            <text
              key={r.round}
              x={xFor(r.round)}
              y={height - MARGIN.bottom + 16}
              fontSize={10}
              fontFamily={M}
              fill={C.textMute}
              textAnchor="middle"
            >{shortMeetingName(r.meetingName)}</text>
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
          {teams.map((t, idx) => {
            if (hidden.has(t.team) || isFocusedTeam(t.team)) return null;
            return (
              <path
                key={t.team + "-bg"}
                d={smoothPath(t.points.map(p => ({ x: xFor(p.round), y: yFor(valueOf(p)) })))}
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
            const isActive = hovered === null || hovered === t.team;
            return (
              <path
                key={t.team}
                d={smoothPath(t.points.map(p => ({ x: xFor(p.round), y: yFor(valueOf(p)) })))}
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
                  <circle key={p.round} cx={xFor(p.round)} cy={yFor(valueOf(p))} r={1.6} fill={teamColor(t.team, idx)} />
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

        {hoveredRace && hoveredRace.teams.map(tp => {
          if (hidden.has(tp.team)) return null;
          const focused = isFocusedTeam(tp.team);
          const v = hoverValue(tp);
          return (
            <circle
              key={"hover-" + tp.team}
              cx={tooltipX}
              cy={yFor(v)}
              r={focused ? 3.5 : 2}
              fill={teamColor(tp.team, teams.findIndex(x => x.team === tp.team))}
              stroke="#0a0a14"
              strokeWidth={1}
              opacity={focused ? 1 : 0.5}
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
            ? Math.min(width - 250, tooltipX + 14)
            : Math.min(width - tooltipX + 14, width - 250),
          background: "rgba(8,8,16,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "10px 12px",
          minWidth: 230,
          maxWidth: 270,
          fontSize: 11,
          fontFamily: F,
          color: C.text,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none",
          zIndex: 5,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            color: C.textMute, marginBottom: 2, textTransform: "uppercase",
          }}>
            Round {hoveredRace.round} · {hoveredRace.meetingName}
          </div>
          <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 6 }}>
            <span style={{ color: MODE_COLOR[mode], fontWeight: 700 }}>{MODE_LABEL[mode]}</span>
            {" · "}
            {sectionSummary(hoveredRace)}
          </div>
          {hoverRanked.map((tp, i) => {
            const idx = teams.findIndex(x => x.team === tp.team);
            const v = hoverValue(tp);
            const isRef = tp.team === hoveredRace.referenceTeam;
            return (
              <div key={tp.team} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "2px 0", opacity: hidden.has(tp.team) ? 0.35 : 1,
              }}>
                <span style={{ color: C.textFaint, fontFamily: M, fontSize: 10, width: 16 }}>{i + 1}</span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: teamColor(tp.team, idx), flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tp.team}
                  {isRef && <span style={{ color: C.textFaint, fontSize: 9, marginLeft: 5 }}>ref</span>}
                </span>
                <span style={{
                  fontFamily: M, fontVariantNumeric: "tabular-nums",
                  color: v < -0.005 ? C.pos : C.textDim, textAlign: "right",
                }}>{fmt(v)}</span>
              </div>
            );
          })}
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
          const last = t.points[t.points.length - 1];
          const lastValue = last ? valueOf(last) : 0;
          return (
            <li key={t.team}>
              <button
                onMouseEnter={() => setHovered(t.team)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHidden(prev => {
                  const next = new Set(prev);
                  if (next.has(t.team)) next.delete(t.team); else next.add(t.team);
                  return next;
                })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "3px 2px",
                  cursor: "pointer",
                  fontFamily: F,
                  fontSize: 11.5,
                  color: isHidden ? C.textFaint : C.text,
                  opacity: isHidden ? 0.45 : focused ? 1 : 0.55,
                  textAlign: "left",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                  background: teamColor(t.team, idx),
                  outline: isHidden ? "1px solid rgba(255,255,255,0.2)" : "none",
                }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.team}
                </span>
                <span style={{
                  fontFamily: M, fontSize: 10.5, fontVariantNumeric: "tabular-nums",
                  color: lastValue < -0.005 ? C.pos : C.textMute,
                }}>{fmt(lastValue)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Sections come from the circuit's geometry — a corner is where the racing line's radius drops below
        250 m, so a corner taken flat still counts as one; a fast curve is a wider bend (up to 600 m) that
        still loads the car at 1.6 g or more, where drag and power decide the time rather than grip. Each line
        is a team's gap through the{" "}
        <span style={{ color: MODE_COLOR[mode], fontWeight: 600 }}>{MODE_LABEL[mode].toLowerCase()}</span>{" "}
        of its fastest qualifying lap, against the fastest team of that weekend. Above the green line means
        quicker than the reference car through that part of the lap — which a team can manage while still
        losing the lap overall, since the corner, curve and straight gaps add up to the total. The reference is
        re-picked every race, so this tracks relative form rather than absolute pace.{" "}
        <strong>%</strong> shows the gap as a share of the reference car's time through that part of the lap —
        worth switching to when comparing circuits, since Monaco's corners take about {"\u2248"}44 s and Monza's
        about 16 s, so the same tenth means very different things.
      </p>
    </div>
  );
}

/** The reference car's own time through each part of the lap for a race — the
 *  base the percentage gaps are a share of. */
function refTimesFor(r: CornerStraightRace): Record<Mode, number> {
  const ref = r.teams.find(t => t.team === r.referenceTeam)
    ?? r.teams.reduce((m, t) => (t.gapToFastest < m.gapToFastest ? t : m), r.teams[0]);
  return { corners: ref?.cornerTime ?? 0, curves: ref?.curveTime ?? 0, straights: ref?.straightTime ?? 0 };
}
