// Fuel model. Start load is regulation-bounded (110 kg for a Grand Prix,
// ~40 kg for a sprint) and burns linearly to near-empty at the flag. The
// time cost of fuel is the interesting number: 0.055 s/kg is the textbook
// figure, but real values run ~0.03–0.07 s/kg by circuit, so when a race has
// enough same-compound stints we fit it from the data and say so.
//
// Convention: every lap is corrected to race-end fuel — the estimated fuel on
// board at the start of the lap, times s/kg, is subtracted. Early (heavy)
// laps therefore read faster once corrected. Slopes are unaffected by the
// choice; only intercepts move.

import type { EnrichedLap, FuelModel } from "../types/model.ts";
import { median, quantile } from "../stats.ts";
import { GATES } from "../gates.ts";

export const GP_START_KG = 110;
export const SPRINT_START_KG = 40;
export const DEFAULT_SEC_PER_KG = 0.055;
/** Plausible band for a fitted s/kg; outside it the default is used. */
export const SEC_PER_KG_MIN = 0.025;
export const SEC_PER_KG_MAX = 0.08;
export const SEC_PER_KG_MAX_IQR = 0.04;

export function baseFuelModel(sprint: boolean, totalLaps: number): FuelModel {
  const startKg = sprint ? SPRINT_START_KG : GP_START_KG;
  return {
    startKg,
    kgPerLap: startKg / Math.max(1, totalLaps),
    secPerKg: DEFAULT_SEC_PER_KG,
    source: "default",
    fitPairs: 0,
    fitIqr: null,
    sprint,
  };
}

/** Estimated fuel on board at the start of a lap. */
export function fuelKgAtLap(model: FuelModel, lapNumber: number): number {
  return Math.max(0, model.startKg - (lapNumber - 1) * model.kgPerLap);
}

export function fuelCorrect(duration: number, fuelKg: number, secPerKg: number): number {
  return duration - fuelKg * secPerKg;
}

/** Fit s/kg from pairs of laps by the same driver on the same compound at the
 *  same tyre age in different stints. Tyre state is matched, so the only
 *  systematic difference between the two laps is fuel (plus track evolution,
 *  which biases the estimate slightly upward — documented, not corrected). */
export function fitSecPerKg(laps: EnrichedLap[]): { secPerKg: number; pairs: number; iqr: number } | null {
  const byDriver: Record<number, EnrichedLap[]> = {};
  for (const l of laps) {
    if (!l.clean || !l.clearAir) continue;
    if (l.stintNumber == null || l.compound == null || l.tyreAge == null || l.tyreAge < 3) continue;
    if (l.fuelKg == null || !l.lap_duration) continue;
    (byDriver[l.driver_number] ||= []).push(l);
  }
  const estimates: number[] = [];
  for (const dl of Object.values(byDriver)) {
    // (compound, tyreAge) → laps from distinct stints
    const cells: Record<string, EnrichedLap[]> = {};
    for (const l of dl) (cells[`${l.compound}|${l.tyreAge}`] ||= []).push(l);
    for (const cell of Object.values(cells)) {
      if (cell.length < 2) continue;
      cell.sort((a, b) => a.lap_number - b.lap_number);
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const early = cell[i], late = cell[j];
          if (early.stintNumber === late.stintNumber) continue;
          const dFuel = (early.fuelKg as number) - (late.fuelKg as number);
          if (dFuel < 5) continue;                       // too close in fuel to say anything
          const dTime = (early.lap_duration as number) - (late.lap_duration as number);
          estimates.push(dTime / dFuel);
        }
      }
    }
  }
  if (estimates.length < GATES.FUEL_FIT_MIN_PAIRS) return null;
  const secPerKg = median(estimates);
  const iqr = quantile(estimates, 0.75) - quantile(estimates, 0.25);
  if (secPerKg < SEC_PER_KG_MIN || secPerKg > SEC_PER_KG_MAX || iqr > SEC_PER_KG_MAX_IQR) return null;
  return { secPerKg, pairs: estimates.length, iqr };
}
