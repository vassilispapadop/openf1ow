// Single-lap sessions — qualifying and practice — read on a time axis, not a
// lap axis. Everything here is keyed to minutes since the first timed lap:
// the phases (Q1/Q2/Q3 from the gaps in running), each driver's push laps,
// how much the track came to the field over the session, the best sectors
// that add up to the ultimate lap, and the teammate gap on a single lap.

import type { SessionModel, EnrichedLap, DriverSummary } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { tCrit95, median } from "../stats.ts";
import { eligibleForBest } from "./quali.ts";

/** A lap is a "push lap" when it is eligible as a best lap and within this
 *  factor of the driver's own session best. In qualifying that is the flying
 *  laps; in practice it is the quali simulations. */
export const PUSH_LAP_FACTOR = 1.03;
/** Gap in running that separates two qualifying segments. */
export const PHASE_GAP_MIN = 5;
export const TRACK_EVOLUTION_MIN_LAPS = 30;
export const TRACK_EVOLUTION_MIN_DRIVERS = 8;

export interface SessionPhase {
  index: number;
  name: string;              // "Q1" | "SQ2" | "Session"
  fromMin: number;
  toMin: number;
}

export interface SessionClock {
  originMs: number;          // epoch ms of the first timed lap's start
  endMin: number;            // minutes to the last lap end
  phases: SessionPhase[];
}

/** Minutes since the session clock's origin for a lap's start; null when
 *  the lap has no timestamp. */
export function lapMinute(clock: SessionClock, l: EnrichedLap): number | null {
  return Number.isFinite(l.tStart) ? (l.tStart - clock.originMs) / 60_000 : null;
}

export function sessionClock(model: SessionModel): SessionClock | null {
  const starts = model.laps.filter(l => Number.isFinite(l.tStart)).map(l => l.tStart).sort((a, b) => a - b);
  if (!starts.length) return null;
  const originMs = starts[0];
  let endMs = starts[starts.length - 1];
  for (const l of model.laps) if (l.tEnd != null && l.tEnd > endMs) endMs = l.tEnd;
  const endMin = (endMs - originMs) / 60_000;

  const phases: SessionPhase[] = [];
  if (model.kind === "qualifying") {
    // Boundaries are the gaps in running. A red flag opens a gap too, so keep
    // only the two largest — a qualifying session has three segments.
    const gaps: { at: number; size: number }[] = [];
    for (let i = 1; i < starts.length; i++) {
      const size = (starts[i] - starts[i - 1]) / 60_000;
      if (size >= PHASE_GAP_MIN) gaps.push({ at: (starts[i - 1] - originMs) / 60_000, size });
    }
    gaps.sort((a, b) => b.size - a.size);
    const cuts = gaps.slice(0, 2).map(g => g.at).sort((a, b) => a - b);
    const prefix = /sprint/i.test(model.info.session_name || "") ? "SQ" : "Q";
    let from = 0;
    cuts.forEach((c, i) => {
      // The phase ends at the last lap start before the gap plus a nominal lap.
      const nextStart = starts.find(s => (s - originMs) / 60_000 > c) as number;
      const to = c + Math.min(2.5, ((nextStart - originMs) / 60_000 - c) / 2);
      phases.push({ index: i, name: `${prefix}${i + 1}`, fromMin: from, toMin: to });
      from = (nextStart - originMs) / 60_000 - 0.25;
    });
    phases.push({ index: cuts.length, name: `${prefix}${cuts.length + 1}`, fromMin: from, toMin: endMin });
  } else {
    phases.push({ index: 0, name: "Session", fromMin: 0, toMin: endMin });
  }
  return { originMs, endMin, phases };
}

export function phaseOf(clock: SessionClock, minute: number): SessionPhase {
  return clock.phases.find(p => minute >= p.fromMin - 0.01 && minute <= p.toMin + 0.01) ?? clock.phases[clock.phases.length - 1];
}

// --- Push laps ---------------------------------------------------------------------

export interface PushLap {
  driver: Driver;
  team: string;
  lap: EnrichedLap;
  minute: number;
  time: number;
  phase: SessionPhase;
  isBest: boolean;           // the driver's session best
}

export interface DriverPushLaps {
  driver: Driver;
  team: string;
  best: number;
  laps: PushLap[];
  /** Best eligible lap in each phase (index = phase.index) — any eligible lap, not only
   *  push laps, so a wet segment still shows a time. Null when the driver set none. */
  phaseBests: (number | null)[];
}

export function pushLaps(model: SessionModel, clock: SessionClock | null = sessionClock(model)): Gated<DriverPushLaps[]> {
  if (!clock) return gate("no_data");
  const out: DriverPushLaps[] = [];
  for (const d of model.drivers) {
    const eligible = d.laps.filter(l => eligibleForBest(l) && Number.isFinite(l.tStart));
    if (!eligible.length) continue;
    const best = Math.min(...eligible.map(l => l.lap_duration as number));
    const laps: PushLap[] = eligible
      .filter(l => (l.lap_duration as number) <= best * PUSH_LAP_FACTOR)
      .map(l => {
        const minute = lapMinute(clock, l) as number;
        return { driver: d.driver, team: d.team, lap: l, minute, time: l.lap_duration as number, phase: phaseOf(clock, minute), isBest: l.lap_duration === best };
      })
      .sort((a, b) => a.minute - b.minute);
    const phaseBests = clock.phases.map(p => {
      const inPhase = eligible.filter(l => phaseOf(clock, lapMinute(clock, l) as number).index === p.index);
      return inPhase.length ? Math.min(...inPhase.map(l => l.lap_duration as number)) : null;
    });
    out.push({ driver: d.driver, team: d.team, best, laps, phaseBests });
  }
  if (!out.length) return gate("no_clean_laps");
  out.sort((a, b) => a.best - b.best);
  return ok(out, out.reduce((s, d) => s + d.laps.length, 0), "high");
}

// --- Track evolution -----------------------------------------------------------------

export interface TrackEvolution {
  secPerMin: number;         // negative = the track got quicker
  ci95: [number, number];
  se: number;
  r2Within: number;          // variance of push-lap time explained within drivers
  n: number;
  drivers: number;
  spanMin: number;           // first → last push lap
  totalGain: number;         // secPerMin × spanMin (negative = quicker)
  /** Field's best push lap in each phase, for the story ("Q3 was 0.4 s quicker than Q1"). */
  phaseBests: { phase: SessionPhase; best: number | null; driver: Driver | null }[];
}

/** Regress push-lap time on session minute with a fixed effect per driver
 *  (within-driver demeaning), so a fast car running late does not read as
 *  track evolution. Only the slope is reported; it is the same for everyone. */
export function trackEvolution(model: SessionModel, clock: SessionClock | null = sessionClock(model)): Gated<TrackEvolution> {
  if (!clock) return gate("no_data");
  const pl = pushLaps(model, clock);
  if (!pl.ok) return pl as Gated<never>;
  const groups = pl.value.filter(d => d.laps.length >= 2);
  const n = groups.reduce((s, d) => s + d.laps.length, 0);
  if (groups.length < TRACK_EVOLUTION_MIN_DRIVERS || n < TRACK_EVOLUTION_MIN_LAPS) return gate("too_few_laps", n, TRACK_EVOLUTION_MIN_LAPS);

  let sxx = 0, sxy = 0, syy = 0;
  const pts: { x: number; y: number }[] = [];
  for (const d of groups) {
    const mx = d.laps.reduce((s, l) => s + l.minute, 0) / d.laps.length;
    const my = d.laps.reduce((s, l) => s + l.time, 0) / d.laps.length;
    for (const l of d.laps) {
      const x = l.minute - mx, y = l.time - my;
      pts.push({ x, y });
      sxx += x * x; sxy += x * y; syy += y * y;
    }
  }
  if (sxx <= 1e-9) return gate("fit_unstable", n, TRACK_EVOLUTION_MIN_LAPS);
  const slope = sxy / sxx;
  const rss = pts.reduce((s, p) => s + (p.y - slope * p.x) ** 2, 0);
  const df = n - groups.length - 1;
  if (df <= 0) return gate("fit_unstable", n, TRACK_EVOLUTION_MIN_LAPS);
  const se = Math.sqrt(rss / df / sxx);
  const t = tCrit95(df);
  const ci: [number, number] = [slope - t * se, slope + t * se];
  const r2 = syy > 0 ? 1 - rss / syy : 0;
  const minutes = groups.flatMap(d => d.laps.map(l => l.minute));
  const span = Math.max(...minutes) - Math.min(...minutes);
  const phaseBests = clock.phases.map(p => {
    let best: number | null = null, driver: Driver | null = null;
    for (const d of pl.value) for (const l of d.laps) if (l.phase.index === p.index && (best == null || l.time < best)) { best = l.time; driver = d.driver; }
    return { phase: p, best, driver };
  });
  const excludesZero = ci[0] > 0 || ci[1] < 0;
  const confidence = excludesZero && (ci[1] - ci[0]) < Math.abs(slope) ? "high" : excludesZero ? "medium" : "low";
  return ok({ secPerMin: slope, ci95: ci, se, r2Within: r2, n, drivers: groups.length, spanMin: span, totalGain: slope * span, phaseBests }, n, confidence,
    r2 < 0.1 ? ["Session time explains little of the lap-time spread — traffic, tyre and fuel differences dominate."] : undefined);
}

// --- Sector bests ---------------------------------------------------------------------

export interface SectorBestRow {
  driver: Driver;
  team: string;
  best: number;                          // best lap
  bests: [number, number, number];       // best sector each, over push-eligible laps
  theoretical: number;                   // own bests summed
  leftOnTable: number;                   // best − theoretical (≥ 0)
  theoreticalRank: number;               // where the theoretical lap would rank among actual bests
  actualRank: number;
  kings: [boolean, boolean, boolean];    // holds the field's best sector
}

export interface SectorBests {
  rows: SectorBestRow[];                 // ranked by actual best
  fieldBests: [number, number, number];
  kings: [Driver | null, Driver | null, Driver | null];
  ultimateLap: number;                   // field's best sectors summed
  pole: number;
}

export function sectorBests(model: SessionModel): Gated<SectorBests> {
  const per: { d: DriverSummary; best: number; bests: [number, number, number] }[] = [];
  for (const d of model.drivers) {
    const eligible = d.laps.filter(eligibleForBest);
    if (!eligible.length) continue;
    const best = Math.min(...eligible.map(l => l.lap_duration as number));
    const col = (k: "duration_sector_1" | "duration_sector_2" | "duration_sector_3") => eligible.map(l => l[k]).filter((v): v is number => v != null && v > 0);
    const s1 = col("duration_sector_1"), s2 = col("duration_sector_2"), s3 = col("duration_sector_3");
    if (!s1.length || !s2.length || !s3.length) continue;
    per.push({ d, best, bests: [Math.min(...s1), Math.min(...s2), Math.min(...s3)] });
  }
  if (!per.length) return gate("no_clean_laps");
  per.sort((a, b) => a.best - b.best);
  const fieldBests: [number, number, number] = [0, 1, 2].map(i => Math.min(...per.map(p => p.bests[i as 0 | 1 | 2]))) as [number, number, number];
  const kings = fieldBests.map((v, i) => per.find(p => p.bests[i as 0 | 1 | 2] === v)?.d.driver ?? null) as [Driver | null, Driver | null, Driver | null];
  const actualBests = per.map(p => p.best);
  const rows: SectorBestRow[] = per.map((p, i) => {
    const theoretical = p.bests[0] + p.bests[1] + p.bests[2];
    // Sector sums and lap_duration are rounded independently, so a
    // one-lap driver can be a millisecond "under" their own lap.
    const left = p.best - theoretical;
    return {
      driver: p.d.driver, team: p.d.team, best: p.best, bests: p.bests, theoretical,
      leftOnTable: left > 0 ? left : 0,
      theoreticalRank: actualBests.filter(b => b < theoretical - 1e-3).length + 1,
      actualRank: i + 1,
      kings: [0, 1, 2].map(k => p.bests[k as 0 | 1 | 2] === fieldBests[k as 0 | 1 | 2]) as [boolean, boolean, boolean],
    };
  });
  return ok({ rows, fieldBests, kings, ultimateLap: fieldBests[0] + fieldBests[1] + fieldBests[2], pole: per[0].best }, rows.length, rows.length >= 10 ? "high" : "medium");
}

// --- Teammates on a single lap ----------------------------------------------------------

export interface PhaseDelta { phase: SessionPhase; a: number | null; b: number | null; delta: number | null }

export interface SingleLapPair {
  team: string;
  a: Driver;
  b: Driver;
  faster: Driver;
  slower: Driver;
  bestA: number;
  bestB: number;
  gap: number;               // |bestA − bestB|
  gapPct: number;
  /** Best-vs-best in each phase both drivers ran; the sign is a − b. */
  phases: PhaseDelta[];
  winsA: number;             // phases a was quicker
  winsB: number;
  /** Median of the phase deltas (a − b) when ≥ 2 phases were shared. */
  medianPhaseDelta: number | null;
  /** Long-run median delta on the same compound (practice), a − b. */
  longRunDelta: { compound: string; delta: number; lapsA: number; lapsB: number } | null;
}

export function teammateSingleLap(model: SessionModel, clock: SessionClock | null = sessionClock(model)): Gated<SingleLapPair[]> {
  const pl = pushLaps(model, clock);
  if (!pl.ok) return pl as Gated<never>;
  const byDn = new Map(pl.value.map(d => [d.driver.driver_number, d]));
  const out: SingleLapPair[] = [];
  for (const team of Object.values(model.teams)) {
    const ds = team.drivers.map(d => byDn.get(d.driver_number)).filter((d): d is DriverPushLaps => !!d);
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const A = ds[i], B = ds[j];
      const phases: PhaseDelta[] = (clock?.phases ?? []).map(p => {
        const a = A.phaseBests[p.index], b = B.phaseBests[p.index];
        return { phase: p, a, b, delta: a != null && b != null ? a - b : null };
      });
      const shared = phases.filter(p => p.delta != null).map(p => p.delta as number);
      const aFaster = A.best <= B.best;
      out.push({
        team: team.name, a: A.driver, b: B.driver,
        faster: aFaster ? A.driver : B.driver, slower: aFaster ? B.driver : A.driver,
        bestA: A.best, bestB: B.best, gap: Math.abs(A.best - B.best), gapPct: Math.abs(A.best - B.best) / Math.min(A.best, B.best) * 100,
        phases, winsA: shared.filter(d => d < 0).length, winsB: shared.filter(d => d > 0).length,
        medianPhaseDelta: shared.length >= 2 ? median(shared) : null,
        longRunDelta: longRunDeltaFor(model, A.driver.driver_number, B.driver.driver_number),
      });
    }
  }
  if (!out.length) return gate("single_driver_team");
  out.sort((a, b) => b.gap - a.gap);
  return ok(out, out.length, "medium");
}

/** Practice: the two drivers' long-run medians on the same compound, when
 *  both ran one (≥ 6 clean laps after the out-lap). */
function longRunDeltaFor(model: SessionModel, a: number, b: number): SingleLapPair["longRunDelta"] {
  if (model.kind !== "practice") return null;
  const runs = (dn: number) => {
    const d = model.byDriver[dn];
    const out: Record<string, { med: number; n: number }> = {};
    for (const s of d?.stints ?? []) {
      const usable = s.laps.filter(l => l.lap_number > s.lap_start && l.clean);
      if (usable.length < 6) continue;
      const med = median(usable.map(l => l.lap_duration as number));
      if (!out[s.compound] || usable.length > out[s.compound].n) out[s.compound] = { med, n: usable.length };
    }
    return out;
  };
  const ra = runs(a), rb = runs(b);
  let best: SingleLapPair["longRunDelta"] = null;
  for (const c of Object.keys(ra)) {
    if (!rb[c]) continue;
    const cand = { compound: c, delta: ra[c].med - rb[c].med, lapsA: ra[c].n, lapsB: rb[c].n };
    if (!best || cand.lapsA + cand.lapsB > best.lapsA + best.lapsB) best = cand;
  }
  return best;
}

// --- Run plan ---------------------------------------------------------------------------

export interface RunSpan {
  stintNumber: number;
  compound: string;
  fromMin: number;
  toMin: number;
  laps: number;
  pushLaps: number;
  best: number | null;
}

export interface DriverRunPlan {
  driver: Driver;
  team: string;
  best: number | null;
  runs: RunSpan[];
  pushMinutes: { minute: number; time: number; isBest: boolean }[];
}

/** Each driver's runs on the session clock: which tyre, when, how many laps,
 *  and where the push laps fell. */
export function runPlan(model: SessionModel, clock: SessionClock | null = sessionClock(model)): Gated<DriverRunPlan[]> {
  if (!clock) return gate("no_data");
  if (!model.coverage.stints) return gate("no_stints");
  const pl = pushLaps(model, clock);
  const pushBy = new Map<number, DriverPushLaps>(pl.ok ? pl.value.map(d => [d.driver.driver_number, d]) : []);
  const out: DriverRunPlan[] = [];
  for (const d of model.drivers) {
    const push = pushBy.get(d.driver.driver_number);
    const runs: RunSpan[] = [];
    for (const s of d.stints) {
      const timed = s.laps.filter(l => Number.isFinite(l.tStart));
      if (!timed.length) continue;
      const from = Math.min(...timed.map(l => l.tStart));
      const to = Math.max(...timed.map(l => l.tEnd ?? l.tStart));
      const inRun = push?.laps.filter(p => p.lap.stintNumber === s.stint_number) ?? [];
      runs.push({
        stintNumber: s.stint_number, compound: s.compound,
        fromMin: (from - clock.originMs) / 60_000, toMin: (to - clock.originMs) / 60_000,
        laps: timed.length, pushLaps: inRun.length, best: inRun.length ? Math.min(...inRun.map(p => p.time)) : null,
      });
    }
    if (!runs.length) continue;
    out.push({ driver: d.driver, team: d.team, best: push?.best ?? null, runs, pushMinutes: push?.laps.map(p => ({ minute: p.minute, time: p.time, isBest: p.isBest })) ?? [] });
  }
  if (!out.length) return gate("no_stints");
  out.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  return ok(out, out.length, "high");
}
