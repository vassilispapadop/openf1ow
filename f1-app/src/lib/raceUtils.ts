import type { Driver, Lap, Stint } from "./types";

// Maximum allowed Grand Prix start fuel under FIA regulations.
export const FUEL_TOTAL_KG = 110;
// Sprint races (~24 laps) are fuelled for the shorter distance — typically
// ~40 kg. Without distinguishing, fuel-corrected tyre deg is ~2.7× over-
// corrected on sprints, inflating reported deg by 50-150 %.
export const FUEL_SPRINT_KG = 40;
// Lap-count threshold for "this is a sprint, not a GP". F1 sprints run
// 17-25 laps; regular GPs are 44-78 laps. 30 leaves comfortable margin.
export const SPRINT_LAP_THRESHOLD = 30;

export const FUEL_SEC_PER_KG = 0.055;
export const SLOW_LAP_FACTOR = 1.07;
export const DIRTY_AIR_THRESHOLD = 1.5;

/** Pick the right start-fuel constant for a session given its total laps. */
export function inferStartFuelKg(totalRaceLaps: number): number {
  return totalRaceLaps > 0 && totalRaceLaps <= SPRINT_LAP_THRESHOLD
    ? FUEL_SPRINT_KG
    : FUEL_TOTAL_KG;
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function linearSlope(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const n = xs.length;
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  return den ? num / den : 0;
}

export function computeSlowLapThreshold(allLaps: Lap[]): number {
  const validTimes = allLaps
    .filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1)
    .map(l => l.lap_duration!);
  if (!validTimes.length) return Infinity;
  return median(validTimes) * SLOW_LAP_FACTOR;
}

export function isCleanLap(l: Lap, threshold: number): boolean {
  return !!(l.lap_duration && l.lap_duration > 0 && l.lap_duration < threshold && !l.is_pit_out_lap && l.lap_number > 1);
}

export function fuelCorrPerLap(totalRaceLaps: number): number {
  return (inferStartFuelKg(totalRaceLaps) / Math.max(1, totalRaceLaps)) * FUEL_SEC_PER_KG;
}

// Single source of truth for "median race pace per driver". Returns RAW
// numbers — formatting belongs to the render layer. Consumers who need
// formatted strings (gap-to-leader, M:SS.sss) wrap this and add their
// own decoration.
export interface DriverPace {
  driver: Driver;
  medianPace: number;       // sec
  bestLap: number;           // sec
  cleanLapCount: number;     // for the minimum-data sanity gate
}

export function paceByDriver(allLaps: Lap[], drivers: Driver[]): DriverPace[] {
  const threshold = computeSlowLapThreshold(allLaps);
  if (!isFinite(threshold)) return [];
  const byDriver: Record<number, number[]> = {};
  for (const l of allLaps) {
    if (!isCleanLap(l, threshold)) continue;
    (byDriver[l.driver_number] ||= []).push(l.lap_duration!);
  }
  return drivers
    .map(d => {
      const t = byDriver[d.driver_number];
      if (!t || t.length < 3) return null;
      t.sort((a, b) => a - b);
      return {
        driver: d,
        medianPace: median(t),
        bestLap: t[0],
        cleanLapCount: t.length,
      };
    })
    .filter((x): x is DriverPace => x !== null);
}

// Fuel-corrected degradation slope for one stint. Skips the first 2 laps of
// the stint (cold tires) by absolute lap_number, not by clean-lap index —
// so a pit-out as lap 1 doesn't shift the cold-tire window forward. Returns
// null when fewer than 3 usable clean laps remain.
export function stintDegradation(
  stint: Stint,
  lapLookup: Record<string, Lap>,
  threshold: number,
  fuelCorr: number,
): { deg: number; usable: Lap[] } | null {
  const usable: Lap[] = [];
  for (let ln = stint.lap_start + 2; ln <= stint.lap_end; ln++) {
    const l = lapLookup[stint.driver_number + "-" + ln];
    if (l && isCleanLap(l, threshold)) usable.push(l);
  }
  if (usable.length < 3) return null;
  const xs = usable.map(l => l.lap_number - stint.lap_start);
  const ys = usable.map(l => l.lap_duration! + (l.lap_number - 1) * fuelCorr);
  return { deg: Math.max(0, linearSlope(xs, ys)), usable };
}
