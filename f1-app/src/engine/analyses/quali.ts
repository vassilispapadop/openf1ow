// Best lap per driver — the core of qualifying and practice, and the one
// definition of "best lap" for every card (no pit-out laps, no opening lap).

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { LapFlag } from "../types/model.ts";

export interface BestLapRow {
  driver: Driver;
  team: string;
  bestLap: number;
  lap: EnrichedLap;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  compound: string | null;
  lapsCompleted: number;       // timed laps, excluding pit-out and lap 1
  st_speed: number | null;
  gapToPole: number;
  gapPct: number;
}

/** Laps eligible to be a "best lap": timed, not a pit-out, not lap 1. Race
 *  fastest laps use the same rule — deliberately not the official top-10
 *  award, which is a different thing. */
export function eligibleForBest(l: EnrichedLap): boolean {
  return !!l.lap_duration && l.lap_duration > 0 && !(l.flags & LapFlag.PIT_OUT) && l.lap_number > 1
    && !(l.flags & (LapFlag.RED | LapFlag.SC | LapFlag.VSC));
}

export function bestLapsByDriver(model: SessionModel): Gated<BestLapRow[]> {
  const rows: BestLapRow[] = [];
  for (const d of model.drivers) {
    const laps = d.laps.filter(eligibleForBest);
    if (!laps.length) continue;
    const best = laps.reduce((b, l) => ((l.lap_duration as number) < (b.lap_duration as number) ? l : b));
    rows.push({
      driver: d.driver, team: d.team,
      bestLap: best.lap_duration as number, lap: best,
      s1: best.duration_sector_1 ?? null, s2: best.duration_sector_2 ?? null, s3: best.duration_sector_3 ?? null,
      compound: best.compound, lapsCompleted: laps.length, st_speed: best.st_speed ?? null,
      gapToPole: 0, gapPct: 0,
    });
  }
  if (!rows.length) return gate("no_clean_laps");
  rows.sort((a, b) => a.bestLap - b.bestLap);
  const pole = rows[0].bestLap;
  for (const r of rows) { r.gapToPole = r.bestLap - pole; r.gapPct = (r.gapToPole / pole) * 100; }
  return ok(rows, rows.length, rows.length >= 10 ? "high" : "medium");
}

/** A single driver's best lap under the same rule. */
export function bestLapFor(model: SessionModel, driverNumber: number): EnrichedLap | null {
  const d = model.byDriver[driverNumber];
  if (!d) return null;
  const laps = d.laps.filter(eligibleForBest);
  return laps.length ? laps.reduce((b, l) => ((l.lap_duration as number) < (b.lap_duration as number) ? l : b)) : null;
}
