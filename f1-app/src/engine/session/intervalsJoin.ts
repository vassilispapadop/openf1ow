// Real gaps, from the timing feed. For each lap we take the interval sample
// published just after the car crossed the line to start it (intervals
// arrive continuously, ~1 Hz per car), and the car ahead from the position
// feed at the same instant. This replaces the old "difference of consecutive
// drivers' date_start" heuristic, which counted lapped and pitting cars as
// "the car ahead" and gave the leader a sentinel gap.

import type { Interval, PositionRow, Lap } from "../types/raw.ts";
import { parseTs } from "./timeline.ts";
import { lastIndexLE } from "../stats.ts";

const BEFORE_MS = 2_000;
const AFTER_MS = 8_000;

export interface LapTraffic {
  gapAhead: number | null;       // seconds; null when unknown
  gapToLeader: number | null;
  lapped: boolean;               // interval/gap reported as "+N LAP(S)"
  position: number | null;
  carAhead: number | null;
  lapping: boolean;              // the car ahead is ≥ 1 lap down on this car
}

interface TsRow<T> { t: number; row: T }

function indexByDriver<T extends { driver_number: number; date: string }>(rows: T[] | null | undefined): Record<number, TsRow<T>[]> {
  const out: Record<number, TsRow<T>[]> = {};
  if (!rows) return out;
  for (const r of rows) {
    const t = parseTs(r.date);
    if (!Number.isFinite(t)) continue;
    (out[r.driver_number] ||= []).push({ t, row: r });
  }
  for (const arr of Object.values(out)) arr.sort((a, b) => a.t - b.t);
  return out;
}

/** Parse an interval field: seconds, or a lapped marker. */
export function parseGap(v: number | string | null | undefined): { seconds: number | null; lapped: boolean } {
  if (v == null) return { seconds: null, lapped: false };
  if (typeof v === "number") return { seconds: Number.isFinite(v) ? v : null, lapped: false };
  const s = String(v).trim();
  if (/LAP/i.test(s)) return { seconds: null, lapped: true };
  const n = Number(s.replace(/^\+/, ""));
  return { seconds: Number.isFinite(n) ? n : null, lapped: false };
}

export interface TrafficIndex {
  hasIntervals: boolean;
  hasPosition: boolean;
  trafficFor(driver: number, lapNumber: number, tStart: number): LapTraffic;
}

export function buildTrafficIndex(
  intervals: Interval[] | null | undefined,
  position: PositionRow[] | null | undefined,
  laps: Lap[],
): TrafficIndex {
  const ivByDriver = indexByDriver(intervals);
  const posByDriver = indexByDriver(position);
  const hasIntervals = Object.keys(ivByDriver).length > 0;
  const hasPosition = Object.keys(posByDriver).length > 0;

  // Lap number each driver is on at time t — for the "lapping" test.
  const lapStartsByDriver: Record<number, { t: number; lap: number }[]> = {};
  for (const l of laps) {
    const t = parseTs(l.date_start);
    if (!Number.isFinite(t)) continue;
    (lapStartsByDriver[l.driver_number] ||= []).push({ t, lap: l.lap_number });
  }
  for (const arr of Object.values(lapStartsByDriver)) arr.sort((a, b) => a.t - b.t);
  const lapAt = (driver: number, t: number): number => {
    const arr = lapStartsByDriver[driver];
    if (!arr) return 0;
    const i = lastIndexLE(arr, x => x.t, t);
    return i >= 0 ? arr[i].lap : 0;
  };

  const drivers = Object.keys(posByDriver).map(Number);
  const positionAt = (driver: number, t: number): number | null => {
    const arr = posByDriver[driver];
    if (!arr?.length) return null;
    const i = lastIndexLE(arr, x => x.t, t);
    return (i >= 0 ? arr[i] : arr[0]).row.position;
  };

  const trafficFor = (driver: number, _lapNumber: number, tStart: number): LapTraffic => {
    const none: LapTraffic = { gapAhead: null, gapToLeader: null, lapped: false, position: null, carAhead: null, lapping: false };
    if (!Number.isFinite(tStart)) return none;

    let gapAhead: number | null = null;
    let gapToLeader: number | null = null;
    let lapped = false;
    const iv = ivByDriver[driver];
    if (iv?.length) {
      // Nearest sample to the line-crossing within [−2 s, +8 s].
      const hi = lastIndexLE(iv, x => x.t, tStart + AFTER_MS);
      let best: TsRow<Interval> | null = null;
      for (let i = hi; i >= 0 && iv[i].t >= tStart - BEFORE_MS; i--) {
        if (!best || Math.abs(iv[i].t - tStart) < Math.abs(best.t - tStart)) best = iv[i];
      }
      if (best) {
        const g = parseGap(best.row.interval);
        const gl = parseGap(best.row.gap_to_leader);
        gapAhead = g.seconds;
        gapToLeader = gl.seconds;
        lapped = g.lapped || gl.lapped;
        // The leader's own interval is 0 by definition; treat it as clear air.
        if (gl.seconds === 0 && g.seconds === 0) gapAhead = null;
      }
    }

    const pos = positionAt(driver, tStart);
    let carAhead: number | null = null;
    let lapping = false;
    if (pos != null && pos > 1) {
      for (const d of drivers) {
        if (d === driver) continue;
        if (positionAt(d, tStart) === pos - 1) { carAhead = d; break; }
      }
      if (carAhead != null) {
        const myLap = lapAt(driver, tStart);
        const theirLap = lapAt(carAhead, tStart);
        if (myLap > 0 && theirLap > 0 && myLap - theirLap >= 1) lapping = true;
      }
    }
    return { gapAhead, gapToLeader, lapped, position: pos, carAhead, lapping };
  };

  return { hasIntervals, hasPosition, trafficFor };
}
