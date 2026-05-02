// Helpers for non-race sessions (Qualifying, Practice). Race-pace style
// metrics (median, fuel-corrected deg, dirty air) are noise on these
// sessions; this module produces session-appropriate analysis instead.

import type { Driver, Lap, Stint } from "./types";
import {
  median,
  linearSlope,
  computeSlowLapThreshold,
  isCleanLap,
} from "./raceUtils";

// Categorise a session by its OpenF1 `session_type` field.
export type SessionKind = "race" | "qualifying" | "practice" | "unknown";

export function classifySession(sessionType: string | undefined, sessionName?: string): SessionKind {
  const t = (sessionType || "").toLowerCase();
  const n = (sessionName || "").toLowerCase();
  if (t === "race" || n === "race" || n === "sprint") return "race";
  if (t === "qualifying" || /^(sprint\s*qualifying|sprint\s*shootout)$/.test(n) || n === "qualifying") return "qualifying";
  if (t === "practice" || n.startsWith("practice") || /^fp\d$/.test(n)) return "practice";
  return "unknown";
}

// Tyre compound for a given driver+lap from the stints array. Returns
// null if no stint covers that lap (data gap).
export function compoundForLap(stints: Stint[], driverNumber: number, lapNumber: number): string | null {
  for (const s of stints) {
    if (s.driver_number === driverNumber && lapNumber >= s.lap_start && lapNumber <= s.lap_end) {
      return s.compound ? s.compound.toUpperCase() : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Best lap per driver — the core metric for Qualifying + Practice.
// Excludes formation/standing-start (lap 1) and pit-out laps.
// ---------------------------------------------------------------------------

export interface BestLapRow {
  driver: Driver;
  bestLap: number;             // sec
  bestLapNumber: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  compound: string | null;     // tyre fitted on the best lap
  lapsCompleted: number;       // total non-out, non-formation laps
  st_speed: number | null;     // speed-trap on the best lap (km/h)
}

export function bestLapsByDriver(laps: Lap[], drivers: Driver[], stints: Stint[]): BestLapRow[] {
  const byDriver: Record<number, Lap[]> = {};
  for (const l of laps) {
    if (!l.lap_duration || l.lap_duration <= 0) continue;
    if (l.is_pit_out_lap) continue;
    if (l.lap_number <= 1) continue;
    (byDriver[l.driver_number] ||= []).push(l);
  }

  return drivers
    .map(d => {
      const driverLaps = byDriver[d.driver_number];
      if (!driverLaps?.length) return null;
      const best = driverLaps.reduce((b, l) => (l.lap_duration! < b.lap_duration! ? l : b));
      return {
        driver: d,
        bestLap: best.lap_duration!,
        bestLapNumber: best.lap_number,
        s1: best.duration_sector_1 ?? null,
        s2: best.duration_sector_2 ?? null,
        s3: best.duration_sector_3 ?? null,
        compound: compoundForLap(stints, d.driver_number, best.lap_number),
        lapsCompleted: driverLaps.length,
        st_speed: best.st_speed ?? null,
      };
    })
    .filter((x): x is BestLapRow => x !== null)
    .sort((a, b) => a.bestLap - b.bestLap);
}

// ---------------------------------------------------------------------------
// Long-run detection (Practice only). When drivers do ≥minLaps consecutive
// clean laps on a single stint, that's a race-pace simulation. We skip the
// first lap (out-lap) and report median pace + linear slope.
//
// NOT fuel-corrected: practice fuel loads are unknown — could be quali sim
// fuel, race-start fuel, or anywhere between. The slope is "raw" pace
// degradation; treat as relative not absolute.
// ---------------------------------------------------------------------------

export interface LongRun {
  driver: Driver;
  stintNumber: number;
  compound: string;
  startLap: number;
  endLap: number;
  laps: Lap[];                 // clean usable laps
  medianPace: number;          // sec
  bestLap: number;             // sec
  slope: number;               // s/lap, raw (not fuel-corrected)
}

export function longRunsByDriver(
  laps: Lap[],
  drivers: Driver[],
  stints: Stint[],
  minLaps = 6,
): LongRun[] {
  const lapMap: Record<string, Lap> = {};
  for (const l of laps) lapMap[l.driver_number + "-" + l.lap_number] = l;

  const threshold = computeSlowLapThreshold(laps);
  if (!isFinite(threshold)) return [];

  const drvByNum: Record<number, Driver> = {};
  drivers.forEach(d => { drvByNum[d.driver_number] = d; });

  const runs: LongRun[] = [];
  for (const s of stints) {
    const usable: Lap[] = [];
    // Skip the out-lap (first lap of stint) — even FP race-sim runs start
    // with a slow tyre-warming lap.
    for (let ln = s.lap_start + 1; ln <= s.lap_end; ln++) {
      const l = lapMap[s.driver_number + "-" + ln];
      if (l && isCleanLap(l, threshold)) usable.push(l);
    }
    if (usable.length < minLaps) continue;

    const drv = drvByNum[s.driver_number];
    if (!drv) continue;

    const times = usable.map(l => l.lap_duration!);
    const xs = usable.map(l => l.lap_number - s.lap_start);
    const slope = linearSlope(xs, times);

    runs.push({
      driver: drv,
      stintNumber: s.stint_number,
      compound: (s.compound || "UNKNOWN").toUpperCase(),
      startLap: s.lap_start,
      endLap: s.lap_end,
      laps: usable,
      medianPace: median(times),
      bestLap: Math.min(...times),
      slope: Math.max(0, slope),
    });
  }
  return runs.sort((a, b) => a.medianPace - b.medianPace);
}

// ---------------------------------------------------------------------------
// Compound program (Practice only). How many laps each driver completed on
// each compound — shows the team's tyre-evaluation strategy.
// ---------------------------------------------------------------------------

export interface CompoundProgram {
  driver: Driver;
  byCompound: Record<string, number>;
  totalLaps: number;
}

export function compoundProgramByDriver(stints: Stint[], drivers: Driver[]): CompoundProgram[] {
  const drvByNum: Record<number, Driver> = {};
  drivers.forEach(d => { drvByNum[d.driver_number] = d; });

  const accum: Record<number, CompoundProgram> = {};
  for (const s of stints) {
    const drv = drvByNum[s.driver_number];
    if (!drv) continue;
    const c = (s.compound || "UNKNOWN").toUpperCase();
    const laps = Math.max(0, s.lap_end - s.lap_start + 1);
    if (laps === 0) continue;
    if (!accum[s.driver_number]) {
      accum[s.driver_number] = { driver: drv, byCompound: {}, totalLaps: 0 };
    }
    accum[s.driver_number].byCompound[c] = (accum[s.driver_number].byCompound[c] ?? 0) + laps;
    accum[s.driver_number].totalLaps += laps;
  }

  return Object.values(accum).sort((a, b) => b.totalLaps - a.totalLaps);
}
