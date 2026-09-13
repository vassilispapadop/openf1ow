// One chart for every season metric. Replaces five near-identical SVG
// engines (constructor pace, constructor qualifying, teammate gap, tyre deg,
// corner/curve/straight evolution) with adapters over charts/LineChart, so
// the crosshair, ranked tooltip, legend and focus behaviour are the same
// everywhere and a new season metric is a few lines of mapping.

import { useMemo, useState } from "react";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt, shortMeetingName } from "../../charts/core/scales";
import { Segmented } from "../../ui";
import { C } from "../../lib/styles";
import { TEAM_COLORS, TEAM_FALLBACK_COLORS, TC } from "../../lib/constants";
import type { SeasonTrends, TireDegRace, CornerStraightRace, TyreLifeRace, ClippingRace } from "../../lib/seasonUtils";

export type SeasonMetric = "race" | "quali" | "teammate" | "tyre" | "tyreLife" | "conversion" | "topSpeed" | "clipping" | "corners" | "curves" | "straights";
type Unit = "s" | "%";

const TOP_N = 3;

interface RoundMeta { round: number; meetingName: string }

function teamColor(team: string, idx: number): string {
  return TEAM_COLORS[team] ?? TEAM_FALLBACK_COLORS[idx % TEAM_FALLBACK_COLORS.length];
}

/** Series per team from any per-race `teams[]` shape. `value` picks the
 *  number; `rank` orders the legend (lower = better). */
function teamSeries<R extends { round: number; teams: { team: string }[] }>(
  races: R[], value: (race: R, t: R["teams"][number]) => number | null, rank: (points: number[]) => number,
): Series[] {
  const byTeam: Record<string, { x: number; y: number }[]> = {};
  for (const r of races) for (const t of r.teams) {
    const v = value(r, t);
    if (v == null || !Number.isFinite(v)) continue;
    (byTeam[t.team] ||= []).push({ x: r.round, y: v });
  }
  return Object.entries(byTeam)
    .map(([team, pts]) => ({ team, pts: pts.sort((a, b) => a.x - b.x) }))
    .map(({ team, pts }) => ({ team, pts, rank: rank(pts.map(p => p.y)) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ team, pts, rank }, i) => ({ key: team, label: team, color: teamColor(team, i), points: pts, rank }));
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

export default function SeasonTrendChart({ trends, metric, height = 380 }: { trends: SeasonTrends; metric: SeasonMetric; height?: number }) {
  const [unit, setUnit] = useState<Unit>("s");
  const [topOnly, setTopOnly] = useState(false);
  const [csMode, setCsMode] = useState<"corners" | "curves" | "straights">(metric === "curves" ? "curves" : metric === "straights" ? "straights" : "corners");
  const [speedMode, setSpeedMode] = useState<"quali" | "race" | "clear">("quali");
  const [clipMode, setClipMode] = useState<"speedLost" | "clipMeters" | "clipEvents">("speedLost");

  const cs = trends.cornerStraight ?? [];
  const hasCurves = cs.some(r => r.teams.some(t => t.curveGap != null));
  const isCs = metric === "corners" || metric === "curves" || metric === "straights";
  const supportsPct = metric === "race" || metric === "quali" || isCs;
  const u: Unit = supportsPct ? unit : "s";

  const { series, rounds, extra, yFormat, yTicksFmt, zeroLabel, invert, includeZero, zeroLine } = useMemo(() => {
    let series: Series[] = [];
    let rounds: RoundMeta[] = [];
    let extra: Series[] = [];
    let yFormat = (v: number) => fmt.signedSec(v);
    let yTicksFmt = (v: number) => fmt.signedSec(v, 2) + "s";
    let zeroLabel: string | undefined;
    let invert = true;
    let includeZero = true;
    let zeroLine: "reference" | "plain" | false = "reference" as "reference" | "plain" | false;

    if (metric === "race") {
      const races = trends.constructorPace;
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      series = teamSeries(races, (r, t) =>
        u === "s" ? t.gapToFastest : (r.fastestTeamMedian > 0 ? (t.gapToFastest / r.fastestTeamMedian) * 100 : null),
        pts => pts[pts.length - 1]);
      zeroLabel = "leader";
    } else if (metric === "quali") {
      const races = trends.constructorQualifying ?? [];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      series = teamSeries(races, (r, t) =>
        u === "s" ? t.gapToFastest : (r.fastestTeamBest > 0 ? (t.gapToFastest / r.fastestTeamBest) * 100 : null),
        pts => pts[pts.length - 1]);
      zeroLabel = "pole car";
      // Q1 / Q2 elimination boundaries as dashed reference series.
      const cut = (key: "q1CutoffGap" | "q2CutoffGap", label: string): Series | null => {
        const pts = races.flatMap(r => {
          const g = r[key];
          if (g == null) return [];
          const v = u === "s" ? g : (r.fastestTeamBest > 0 ? (g / r.fastestTeamBest) * 100 : null);
          return v == null ? [] : [{ x: r.round, y: v }];
        });
        return pts.length ? { key, label, color: C.textFaint, dash: true, points: pts, rank: Infinity } : null;
      };
      extra = [cut("q1CutoffGap", "Q1 cut (15th)"), cut("q2CutoffGap", "Q2 cut (10th)")].filter((x): x is Series => !!x);
    } else if (metric === "teammate") {
      const races = trends.teammateGap;
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      // Sign by the first-seen faster driver per team, so a line crossing zero
      // means the other teammate became the quicker one.
      const firstFaster: Record<string, string> = {};
      for (const r of races) for (const t of r.teams) firstFaster[t.team] ??= t.faster;
      series = teamSeries(races, (_r, t) => (t.faster === firstFaster[t.team] ? t.gap : -t.gap), pts => -mean(pts.map(Math.abs)));
      yFormat = v => fmt.signedSec(v);
      yTicksFmt = v => fmt.signedSec(v, 2) + "s";
      invert = false;
      zeroLine = "plain";
      zeroLabel = undefined;
    } else if (metric === "topSpeed") {
      const races = trends.topSpeed ?? [];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      series = teamSeries(races, (_r, t) => (speedMode === "quali" ? t.qualiTrap : speedMode === "race" ? t.raceTrap : t.raceTrapClear), pts => -mean(pts));
      yFormat = v => Math.round(v) + " km/h";
      yTicksFmt = v => String(Math.round(v));
      invert = false;
      includeZero = false;
      zeroLine = false as const;
    } else if (metric === "clipping") {
      const races = (trends.superClipping ?? []) as ClippingRace[];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      series = teamSeries(races, (_r, t) => t[clipMode], pts => mean(pts));
      yFormat = v => (clipMode === "speedLost" ? Math.round(v) + " km/h lost" : clipMode === "clipMeters" ? Math.round(v) + " m" : Math.round(v) + (Math.round(v) === 1 ? " event" : " events"));
      yTicksFmt = v => String(Math.round(v));
      invert = false;
      includeZero = true;
      zeroLine = "plain";
      zeroLabel = undefined;
    } else if (metric === "conversion") {
      const races = trends.conversion ?? [];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      series = teamSeries(races, (_r, t) => t.meanGridToFinish, pts => -mean(pts));
      yFormat = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " places";
      yTicksFmt = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(0);
      invert = false;
      includeZero = true;
      zeroLine = "plain";
      zeroLabel = "held position";
    } else if (metric === "tyreLife") {
      const races = (trends.tyreLife ?? []) as TyreLifeRace[];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      const byC: Record<string, { x: number; y: number }[]> = {};
      for (const r of races) for (const c of r.compounds) (byC[c.compound] ||= []).push({ x: r.round, y: c.p90StintLength });
      series = Object.entries(byC).map(([compound, pts]) => ({
        key: compound, label: compound, color: TC[compound] ?? C.textDim, points: pts.sort((a, b) => a.x - b.x), rank: -mean(pts.map(p => p.y)),
      })).sort((a, b) => a.rank - b.rank);
      // Cliff ages as dashed companions where the pooled curve stepped up.
      const cliffs: Record<string, { x: number; y: number }[]> = {};
      for (const r of races) for (const c of r.compounds) if (c.cliffAge != null) (cliffs[c.compound] ||= []).push({ x: r.round, y: c.cliffAge });
      extra = Object.entries(cliffs).map(([compound, pts]) => ({ key: compound + "-cliff", label: compound + " cliff", color: TC[compound] ?? C.textDim, dash: true, points: pts.sort((a, b) => a.x - b.x), rank: Infinity }));
      yFormat = v => Math.round(v) + " laps";
      yTicksFmt = v => String(Math.round(v));
      invert = false;
      includeZero = true;
      zeroLine = false as const;
    } else if (metric === "tyre") {
      const races = trends.tireDeg;
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      const byC: Record<string, { x: number; y: number }[]> = {};
      for (const r of races as TireDegRace[]) for (const c of r.compounds) (byC[c.compound] ||= []).push({ x: r.round, y: c.medianDeg });
      series = Object.entries(byC).map(([compound, pts]) => ({
        key: compound, label: compound, color: TC[compound] ?? C.textDim, points: pts.sort((a, b) => a.x - b.x), rank: mean(pts.map(p => p.y)),
      })).sort((a, b) => a.rank - b.rank);
      yFormat = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3) + " s/lap";
      yTicksFmt = v => v.toFixed(2);
      invert = false;
      includeZero = true;
      zeroLine = "plain";
    } else {
      const races = cs as CornerStraightRace[];
      rounds = races.map(r => ({ round: r.round, meetingName: r.meetingName }));
      const gapOf = (t: CornerStraightRace["teams"][number]) =>
        csMode === "corners" ? t.cornerGap : csMode === "curves" ? (t.curveGap ?? 0) : t.straightGap;
      const refTime = (r: CornerStraightRace) => {
        const ref = r.teams.find(t => t.team === r.referenceTeam) ?? r.teams[0];
        return csMode === "corners" ? ref?.cornerTime ?? 0 : csMode === "curves" ? ref?.curveTime ?? 0 : ref?.straightTime ?? 0;
      };
      series = teamSeries(races, (r, t) => (u === "s" ? gapOf(t) : (refTime(r) > 0 ? (gapOf(t) / refTime(r)) * 100 : null)),
        pts => mean(pts));
      zeroLabel = "reference";
    }
    if (u === "%") { yFormat = v => fmt.pct(v); yTicksFmt = v => fmt.pct(v, 1); }
    return { series, rounds, extra, yFormat, yTicksFmt, zeroLabel, invert, includeZero, zeroLine };
  }, [trends, metric, u, csMode, cs, speedMode, clipMode]);

  const focus = useMemo(() => (topOnly ? new Set(series.slice(0, TOP_N).map(s => s.key)) : null), [series, topOnly]);
  const roundMeta = useMemo(() => Object.fromEntries(rounds.map(r => [r.round, r])), [rounds]);
  const xTicks = useMemo(() => {
    const everyN = Math.max(1, Math.ceil(rounds.length / 8));
    return rounds.filter((_, i) => i % everyN === 0 || i === rounds.length - 1).map(r => ({ value: r.round, label: shortMeetingName(r.meetingName) }));
  }, [rounds]);

  if (!series.length) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {isCs && (
          <Segmented size="sm" role="radiogroup" ariaLabel="Part of the lap" value={csMode} onChange={setCsMode}
            options={[{ key: "corners", label: "Corners" }, ...(hasCurves ? [{ key: "curves" as const, label: "Fast curves" }] : []), { key: "straights", label: "Straights" }]} />
        )}
        {metric === "clipping" && (
          <Segmented size="sm" role="radiogroup" ariaLabel="Clipping measure" value={clipMode} onChange={setClipMode}
            options={[{ key: "speedLost", label: "Speed lost" }, { key: "clipMeters", label: "Metres" }, { key: "clipEvents", label: "Events" }]} />
        )}
        {metric === "topSpeed" && (
          <Segmented size="sm" role="radiogroup" ariaLabel="Session" value={speedMode} onChange={setSpeedMode}
            options={[{ key: "quali", label: "Qualifying" }, { key: "race", label: "Race" }, { key: "clear", label: "Race, clear air" }]} />
        )}
        {supportsPct && (
          <Segmented size="sm" role="radiogroup" ariaLabel="Gap unit" value={u} onChange={setUnit}
            options={[{ key: "s", label: "Sec" }, { key: "%", label: "%" }]} />
        )}
        <Segmented size="sm" role="radiogroup" ariaLabel="Teams shown" value={topOnly ? "top" : "all"} onChange={k => setTopOnly(k === "top")}
          options={[{ key: "all", label: "All" }, { key: "top", label: `Top ${TOP_N}` }]} />
      </div>
      <LineChart
        series={[...series, ...extra]}
        height={height}
        x={{ ticks: xTicks, format: v => roundMeta[v]?.meetingName ?? `Round ${v}` }}
        y={{ format: yTicksFmt, invert, includeZero, zeroLine, zeroLabel, targetTicks: 6 }}
        focus={focus}
        format={yFormat}
        rankOrder={metric === "topSpeed" ? "desc" : "asc"}
        tipTitle={x => `Round ${x} · ${roundMeta[x]?.meetingName ?? ""}`}
        endDots
        endLabels
        legend={{ columns: 2, hint: true }}
        ariaLabel={`${metric} trend by round`}
      />
      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        {metric === "race" && "Each line is a constructor's median lap-time gap to the fastest car of that race. Hover for the full ranking at any round."}
        {metric === "quali" && "Each line is the faster of each team's drivers in qualifying, against the fastest team of that race. Dashed lines are the 15th- and 10th-best laps — the approximate Q1 and Q2 elimination boundaries."}
        {metric === "teammate" && "Positive: the driver who was quicker at their first race together is still ahead; below the dashed line the other teammate has taken over. Gaps are medians of paired laps in the same traffic state."}
        {metric === "tyre" && "Median slope of fuel-corrected lap time against tyre age per compound, race by race. Negative means the compound was still coming in."}
        {metric === "tyreLife" && "Solid: the 90th-percentile stint length on each compound that race — how long teams were prepared to run it. Dashed: the tyre age where the pooled degradation curve stepped up by 0.3 s or more, when it did."}
        {metric === "topSpeed" && "Each team's best speed-trap reading of the weekend — its quicker driver — by round. Qualifying is the cleanest read (low fuel, DRS open, one lap); the race view includes tows, the clear-air view takes them out where the timing intervals allow. Circuits differ, so read the spread between teams at a round rather than the level."}
        {metric === "clipping" && "On each team's fastest qualifying lap: stretches at full throttle where the car still lost speed outside the DRS zones — the power unit clipping its deployment. Speed lost is the sum of the drops; a team that clips is leaving straight-line speed on the table, usually a sign of an energy-limited lap."}
        {metric === "conversion" && "Mean places gained from grid to flag by each team's classified drivers. Above the line the team converted better than its grid slots; strategy, incidents and others' misfortune all land here."}
        {isCs && "A team's gap through that part of the lap on its fastest qualifying lap, against the fastest team of the weekend. Above the reference line means quicker there — which a team can manage while still losing the lap, since the corner, curve and straight gaps add up to the total."}
      </p>
    </div>
  );
}
