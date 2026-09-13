// One definition of consistency: the sample σ of a driver's clean clear-air
// fuel-corrected laps, with the MAD-based robust σ beside it so a single
// off lap does not dominate. Also the share of racing laps that were clean.

import type { SessionModel, DriverSummary } from "../types/model.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { sampleStd, mad, median } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface ConsistencyRow {
  driver: DriverSummary["driver"];
  team: string;
  sigma: number;             // sample σ, sec
  robustSigma: number;       // 1.4826 × MAD, sec
  median: number;            // fuel-corrected median of the laps used
  n: number;
  cleanShare: number;        // clean laps / timed racing laps (excl. lap 1, pits, neutralised)
}

export function consistencyByDriver(model: SessionModel): Gated<ConsistencyRow[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const rows: ConsistencyRow[] = [];
  for (const d of model.drivers) {
    const used = d.laps.filter(l => l.clearAir && l.fuelCorrected != null);
    if (used.length < GATES.CONSISTENCY_MIN) continue;
    const ys = used.map(l => l.fuelCorrected as number);
    const timed = d.laps.filter(l => l.lap_duration && l.lap_duration > 0 && l.lap_number > 1);
    rows.push({
      driver: d.driver,
      team: d.team,
      sigma: sampleStd(ys),
      robustSigma: mad(ys),
      median: median(ys),
      n: used.length,
      cleanShare: timed.length ? d.cleanLapCount / timed.length : 0,
    });
  }
  if (!rows.length) return gate("too_few_laps", 0, GATES.CONSISTENCY_MIN);
  rows.sort((a, b) => a.sigma - b.sigma);
  return ok(rows, rows.length, confidenceFromN(rows.length, 6));
}
