// Practice: long runs (race simulations) and compound programmes. Long-run
// slopes are raw — practice fuel loads are unknown — and reported with their
// fit so the reader can see how much to trust them. Not clamped.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Fit, type Gated, ok, gate } from "../types/gated.ts";
import { median, olsFit } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface LongRun {
  driver: Driver;
  team: string;
  stintNumber: number;
  compound: string;
  startLap: number;
  endLap: number;
  laps: EnrichedLap[];
  medianPace: number;
  bestLap: number;
  fit: Fit | null;           // raw lap time vs laps into the run
}

export function longRuns(model: SessionModel, minLaps = GATES.LONGRUN_MIN): Gated<LongRun[]> {
  if (!model.coverage.stints) return gate("no_stints");
  const runs: LongRun[] = [];
  for (const d of model.drivers) {
    for (const s of d.stints) {
      // Skip the out-lap: even a race-sim run starts with a tyre-warming lap.
      const usable = s.laps.filter(l => l.lap_number > s.lap_start && l.clean);
      if (usable.length < minLaps) continue;
      const times = usable.map(l => l.lap_duration as number);
      runs.push({
        driver: d.driver, team: d.team, stintNumber: s.stint_number, compound: s.compound,
        startLap: s.lap_start, endLap: s.lap_end, laps: usable,
        medianPace: median(times), bestLap: Math.min(...times),
        fit: olsFit(usable.map(l => l.lap_number - s.lap_start), times),
      });
    }
  }
  if (!runs.length) return gate("too_few_laps", 0, minLaps);
  runs.sort((a, b) => a.medianPace - b.medianPace);
  return ok(runs, runs.length, runs.length >= 8 ? "medium" : "low",
    ["Raw lap times — practice fuel loads are unknown, so read slopes as relative, not absolute."]);
}

export interface CompoundProgram {
  driver: Driver;
  team: string;
  byCompound: Record<string, number>;
  totalLaps: number;
}

export function compoundPrograms(model: SessionModel): Gated<CompoundProgram[]> {
  if (!model.coverage.stints) return gate("no_stints");
  const out: CompoundProgram[] = [];
  for (const d of model.drivers) {
    const by: Record<string, number> = {};
    let total = 0;
    for (const s of d.stints) {
      if (s.lengthLaps <= 0) continue;
      by[s.compound] = (by[s.compound] ?? 0) + s.lengthLaps;
      total += s.lengthLaps;
    }
    if (total) out.push({ driver: d.driver, team: d.team, byCompound: by, totalLaps: total });
  }
  if (!out.length) return gate("no_stints");
  out.sort((a, b) => b.totalLaps - a.totalLaps);
  return ok(out, out.length, "high");
}
