// Lap timestamps. OpenF1 gives each lap a `date_start`; the end is the start
// plus the duration, or — when the duration is missing (formation, the lap a
// car retired on) — the next lap's start for that driver.

import type { Lap, RaceControlMsg } from "../types/raw.ts";

export function parseTs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

export interface LapTimes {
  tStart: number;
  tEnd: number | null;
}

/** Per lap key (`${driver}-${lap}`) start and end in epoch ms. */
export function lapTimes(laps: Lap[]): Record<string, LapTimes> {
  const byDriver: Record<number, Lap[]> = {};
  for (const l of laps) (byDriver[l.driver_number] ||= []).push(l);
  const out: Record<string, LapTimes> = {};
  for (const ls of Object.values(byDriver)) {
    ls.sort((a, b) => a.lap_number - b.lap_number);
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const tStart = parseTs(l.date_start);
      let tEnd: number | null = null;
      if (Number.isFinite(tStart)) {
        if (l.lap_duration && l.lap_duration > 0) tEnd = tStart + l.lap_duration * 1000;
        else {
          const next = ls[i + 1];
          const nt = next ? parseTs(next.date_start) : NaN;
          tEnd = Number.isFinite(nt) ? nt : null;
        }
      }
      out[`${l.driver_number}-${l.lap_number}`] = { tStart, tEnd };
    }
  }
  return out;
}

/** The race start: earliest start of a lap-1 record with a timestamp. For
 *  qualifying/practice this is simply the first timed lap. */
export function sessionStart(laps: Lap[], times: Record<string, LapTimes>): number | null {
  let t = Infinity;
  for (const l of laps) {
    const ts = times[`${l.driver_number}-${l.lap_number}`]?.tStart;
    if (ts != null && Number.isFinite(ts) && ts < t) t = ts;
  }
  return Number.isFinite(t) ? t : null;
}

/** Chequered flag from race control, else the latest lap end we have. */
export function chequeredAt(rc: RaceControlMsg[] | null | undefined, times: Record<string, LapTimes>): number | null {
  const flag = rc?.find(m => (m.flag || "").toUpperCase() === "CHEQUERED");
  if (flag) {
    const t = parseTs(flag.date);
    if (Number.isFinite(t)) return t;
  }
  let t = -Infinity;
  for (const lt of Object.values(times)) if (lt.tEnd != null && lt.tEnd > t) t = lt.tEnd;
  return Number.isFinite(t) ? t : null;
}
