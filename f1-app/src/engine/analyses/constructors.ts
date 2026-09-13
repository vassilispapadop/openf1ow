// Constructor pace: all of a team's clean laps pooled, from every driver who
// ran for it, with each driver's own median alongside.

import type { SessionModel } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median, bootstrapMedianCI } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface ConstructorDriverRow {
  driver: Driver;
  medianPace: number | null;   // fuel-corrected; null below PACE_MIN_CLEAN
  bestLap: number | null;
  n: number;
}

export interface ConstructorRow {
  team: string;
  color: string;
  medianPace: number;          // pooled, fuel-corrected
  ci95: [number, number];
  n: number;
  gapToFastest: number;
  drivers: ConstructorDriverRow[];
  intraTeamGap: number | null; // slower − faster driver median, when both have one
}

export function constructorPace(model: SessionModel): Gated<ConstructorRow[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const rows: ConstructorRow[] = [];
  for (const team of Object.values(model.teams)) {
    const pooled: number[] = [];
    const drivers: ConstructorDriverRow[] = [];
    for (const d of team.drivers) {
      const s = model.byDriver[d.driver_number];
      const ys = (s?.laps ?? []).filter(l => l.clean && l.fuelCorrected != null).map(l => l.fuelCorrected as number);
      pooled.push(...ys);
      const raw = (s?.laps ?? []).filter(l => l.clean && l.lap_duration).map(l => l.lap_duration as number);
      drivers.push({
        driver: d,
        medianPace: ys.length >= GATES.PACE_MIN_CLEAN ? median(ys) : null,
        bestLap: raw.length ? Math.min(...raw) : null,
        n: ys.length,
      });
    }
    if (pooled.length < GATES.CONSTRUCTOR_MIN) continue;
    const withPace = drivers.filter(d => d.medianPace != null).map(d => d.medianPace as number).sort((a, b) => a - b);
    rows.push({
      team: team.name,
      color: team.color,
      medianPace: median(pooled),
      ci95: bootstrapMedianCI(pooled),
      n: pooled.length,
      gapToFastest: 0,
      drivers: drivers.sort((a, b) => (a.medianPace ?? Infinity) - (b.medianPace ?? Infinity)),
      intraTeamGap: withPace.length >= 2 ? withPace[withPace.length - 1] - withPace[0] : null,
    });
  }
  if (!rows.length) return gate("too_few_laps", 0, GATES.CONSTRUCTOR_MIN);
  rows.sort((a, b) => a.medianPace - b.medianPace);
  const ref = rows[0].medianPace;
  for (const r of rows) r.gapToFastest = r.medianPace - ref;
  return ok(rows, rows.length, confidenceFromN(rows.length, 4));
}
