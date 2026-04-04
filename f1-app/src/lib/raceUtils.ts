import type { Lap } from "./types";

export const FUEL_TOTAL_KG = 110;
export const FUEL_SEC_PER_KG = 0.055;
export const SLOW_LAP_FACTOR = 1.07;
export const DIRTY_AIR_THRESHOLD = 1.5;

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
