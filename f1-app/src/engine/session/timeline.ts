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

/** Chequered flag from race control, else the latest lap end we have. A
 *  qualifying session shows one chequered flag per segment; the session's
 *  end is the last of them. */
export function chequeredAt(rc: RaceControlMsg[] | null | undefined, times: Record<string, LapTimes>): number | null {
  let flagged = -Infinity;
  for (const m of rc ?? []) {
    if ((m.flag || "").toUpperCase() !== "CHEQUERED") continue;
    const t = parseTs(m.date);
    if (Number.isFinite(t) && t > flagged) flagged = t;
  }
  if (Number.isFinite(flagged)) return flagged;
  let t = -Infinity;
  for (const lt of Object.values(times)) if (lt.tEnd != null && lt.tEnd > t) t = lt.tEnd;
  return Number.isFinite(t) ? t : null;
}

export interface SessionSegment {
  index: number;             // 0-based: Q1 = 0
  tStart: number;            // epoch ms of the green light that opened it
  tEnd: number | null;       // epoch ms of its chequered flag; null if never shown
}

/** Qualifying segments (Q1/Q2/Q3) from race control. Each segment opens with
 *  "GREEN LIGHT - PIT EXIT OPEN" (or SESSION STARTED) and closes with its
 *  chequered flag. A red flag inside a segment re-opens it with another green
 *  light, so a green while a segment is open is not a new segment. When the
 *  feed tags messages with `qualifying_phase`, that is trusted first. */
export function sessionSegments(rc: RaceControlMsg[] | null | undefined): SessionSegment[] {
  const msgs = (rc ?? [])
    .map(m => ({ m, t: parseTs(m.date) }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const isGreen = (m: RaceControlMsg) => /PIT EXIT OPEN/i.test(m.message) || /^SESSION STARTED/i.test(m.message);
  const isCheq = (m: RaceControlMsg) => (m.flag || "").toUpperCase() === "CHEQUERED" || /^SESSION FINISHED/i.test(m.message);

  const out: SessionSegment[] = [];
  const tagged = msgs.filter(x => x.m.qualifying_phase != null && (isGreen(x.m) || isCheq(x.m)));
  if (tagged.length) {
    const byPhase = new Map<number, { start: number; end: number | null }>();
    for (const { m, t } of tagged) {
      const k = m.qualifying_phase as number;
      const cur = byPhase.get(k) ?? { start: Infinity, end: null };
      if (isGreen(m)) cur.start = Math.min(cur.start, t);
      else cur.end = cur.end == null ? t : Math.max(cur.end, t);
      byPhase.set(k, cur);
    }
    [...byPhase.entries()].sort((a, b) => a[0] - b[0]).forEach(([, v]) => {
      if (Number.isFinite(v.start)) out.push({ index: out.length, tStart: v.start, tEnd: v.end });
    });
    if (out.length) return out;
  }

  let open: SessionSegment | null = null;
  for (const { m, t } of msgs) {
    if (isGreen(m)) {
      if (open) continue;
      open = { index: out.length, tStart: t, tEnd: null };
      out.push(open);
    } else if (isCheq(m) && open) {
      open.tEnd = t;
      open = null;
    }
  }
  return out;
}

/** Lap keys (`${driver}-${lap}`) whose time race control deleted — "CAR 6
 *  (HAD) TIME 1:32.048 DELETED - TRACK LIMITS …". Matched on the driver and
 *  the time, not the message's lap number, which runs one ahead of the timing
 *  feed's. A later "REINSTATED" for the same time undoes it. Messages without a
 *  time ("LAP DELETED … (PIT)") concern laps that are never a best lap anyway. */
export function deletedLapKeys(rc: RaceControlMsg[] | null | undefined, laps: Lap[]): Set<string> {
  const out = new Set<string>();
  if (!rc?.length) return out;
  const re = /CAR\s+(\d+)\b.*?\bTIME\s+(\d+):(\d+(?:\.\d+)?)\s+(DELETED|REINSTATED)/i;
  const sorted = [...rc].map(m => ({ m, t: parseTs(m.date) })).sort((a, b) => a.t - b.t);
  for (const { m } of sorted) {
    const hit = re.exec(m.message || "");
    if (!hit) continue;
    const dn = Number(hit[1]);
    const secs = Number(hit[2]) * 60 + Number(hit[3]);
    const lap = laps.find(l => l.driver_number === dn && l.lap_duration != null && Math.abs(l.lap_duration - secs) < 0.0015);
    if (!lap) continue;
    const key = `${lap.driver_number}-${lap.lap_number}`;
    if (/REINSTATED/i.test(hit[4])) out.delete(key); else out.add(key);
  }
  return out;
}
