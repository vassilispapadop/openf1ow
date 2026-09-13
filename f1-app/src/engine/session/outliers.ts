// Robust outlier flag, per driver per stint. Replaces the single
// session-wide "median × 1.07" cut: traffic, a lock-up or damage are slow
// relative to *your own* stint, and a wet→dry race or a safety-car-heavy one
// moves the field median so far that a global cut lets neutralised laps
// through. A wide session-level sanity cap still catches broken data.

import { LapFlag, CLEAN_MASK, type EnrichedLap } from "../types/model.ts";
import { mad, median } from "../stats.ts";

const K_MAD = 3;
const MAD_FLOOR_S = 0.25;
const SESSION_CAP = 1.12;
const MIN_STINT_CANDIDATES = 4;

/** Sets or clears LapFlag.OUTLIER on every lap in place. Laps with any other
 *  clean-mask flag are never candidates, so an SC lap is "SC", not "outlier". */
export function flagOutliers(laps: EnrichedLap[]): void {
  const structural = CLEAN_MASK & ~LapFlag.OUTLIER;
  const candidates = laps.filter(l =>
    (l.flags & structural) === 0 && !!l.lap_duration && l.lap_duration > 0 && l.fuelCorrected != null);

  for (const l of laps) l.flags &= ~LapFlag.OUTLIER;
  if (!candidates.length) return;

  const cap = median(candidates.map(l => l.lap_duration as number)) * SESSION_CAP;

  const byStint: Record<string, EnrichedLap[]> = {};
  for (const l of candidates) (byStint[`${l.driver_number}|${l.stintNumber ?? "x"}`] ||= []).push(l);

  for (const group of Object.values(byStint)) {
    const ys = group.map(l => l.fuelCorrected as number);
    let cut = Infinity;
    if (group.length >= MIN_STINT_CANDIDATES) {
      const med = median(ys);
      const s = Math.max(MAD_FLOOR_S, mad(ys));
      cut = med + K_MAD * s;
    }
    for (const l of group) {
      if ((l.fuelCorrected as number) > cut || (l.lap_duration as number) > cap) l.flags |= LapFlag.OUTLIER;
    }
  }
}
