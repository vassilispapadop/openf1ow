// Safety car, virtual safety car, red flag and sector-yellow windows from the
// race-control feed. Observed message shapes (2026):
//
//   category "SafetyCar", flag null:  "SAFETY CAR DEPLOYED"
//                                     "VIRTUAL SAFETY CAR DEPLOYED"
//                                     "SAFETY CAR IN THIS LAP" / "VIRTUAL SAFETY CAR ENDING"
//   category "Flag", flag "RED",  scope "Track"
//   category "Flag", flag "GREEN", scope "Track"          (also the restart)
//   category "Flag", flag "YELLOW" | "DOUBLE YELLOW", scope "Sector", sector n
//   category "Flag", flag "CLEAR",  scope "Sector" | "Track"
//
// "IN THIS LAP" means the cars are still behind the safety car for the rest
// of that lap, so an SC/VSC closes at the start of the leader's *next* lap;
// a red flag closes on the next track-wide GREEN.

import type { RaceControlMsg } from "../types/raw.ts";
import type { Neutralisation } from "../types/model.ts";
import { parseTs } from "./timeline.ts";

interface LeaderLap { lap: number; tStart: number }

/** Start of the leader's lap after time t (the first lap-start strictly later
 *  than t across the field), else null. */
function nextLapStartAfter(t: number, leaderLaps: LeaderLap[]): number | null {
  for (const l of leaderLaps) if (l.tStart > t) return l.tStart;
  return null;
}

function leaderLapAt(t: number, leaderLaps: LeaderLap[]): number {
  let lap = 0;
  for (const l of leaderLaps) { if (l.tStart <= t) lap = l.lap; else break; }
  return lap;
}

export function buildNeutralisations(
  rc: RaceControlMsg[] | null | undefined,
  leaderLaps: LeaderLap[],           // ascending by tStart: earliest start of each lap number
  chequered: number | null,
): Neutralisation[] {
  if (!rc?.length) return [];
  const msgs = [...rc]
    .map(m => ({ m, t: parseTs(m.date) }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const end = chequered ?? (msgs.length ? msgs[msgs.length - 1].t : 0);

  const out: Neutralisation[] = [];
  let openSC: Neutralisation | null = null;
  let openRed: Neutralisation | null = null;
  const openYellow: Record<number, Neutralisation> = {};

  const close = (n: Neutralisation, t: number) => {
    n.tEnd = Math.max(n.tStart, t);
    n.lapEnd = Math.max(n.lapStart, leaderLapAt(n.tEnd, leaderLaps));
    out.push(n);
  };

  for (const { m, t } of msgs) {
    const cat = (m.category || "").toLowerCase();
    const flag = (m.flag || "").toUpperCase();
    const scope = (m.scope || "").toLowerCase();
    const text = (m.message || "").toUpperCase();

    if (cat === "safetycar") {
      if (/DEPLOYED/.test(text)) {
        if (openSC) close(openSC, t);
        openSC = {
          kind: /VIRTUAL/.test(text) ? "VSC" : "SC",
          tStart: t, tEnd: t,
          lapStart: m.lap_number ?? leaderLapAt(t, leaderLaps), lapEnd: 0,
          sector: null, messages: [m],
        };
      } else if (/IN THIS LAP|ENDING|WITHDRAWN/.test(text) && openSC) {
        openSC.messages.push(m);
        // The pack is released at the start of the next lap.
        close(openSC, nextLapStartAfter(t, leaderLaps) ?? t);
        openSC = null;
      } else if (openSC) {
        openSC.messages.push(m);
      }
      continue;
    }

    if (cat === "flag") {
      if (flag === "RED") {
        if (!openRed) {
          openRed = {
            kind: "RED", tStart: t, tEnd: t,
            lapStart: m.lap_number ?? leaderLapAt(t, leaderLaps), lapEnd: 0,
            sector: null, messages: [m],
          };
        } else openRed.messages.push(m);
        continue;
      }
      if (flag === "GREEN" && scope === "track" && openRed) {
        openRed.messages.push(m);
        close(openRed, t);
        openRed = null;
        continue;
      }
      if ((flag === "YELLOW" || flag === "DOUBLE YELLOW") && scope === "sector" && m.sector) {
        const s = m.sector;
        if (!openYellow[s]) {
          openYellow[s] = {
            kind: "YELLOW", tStart: t, tEnd: t,
            lapStart: m.lap_number ?? leaderLapAt(t, leaderLaps), lapEnd: 0,
            sector: (s as 1 | 2 | 3), messages: [m],
          };
        } else openYellow[s].messages.push(m);
        continue;
      }
      if (flag === "CLEAR") {
        if (scope === "sector" && m.sector && openYellow[m.sector]) {
          openYellow[m.sector].messages.push(m);
          close(openYellow[m.sector], t);
          delete openYellow[m.sector];
        } else if (scope === "track") {
          for (const s of Object.keys(openYellow)) {
            const n = openYellow[Number(s)];
            n.messages.push(m);
            close(n, t);
            delete openYellow[Number(s)];
          }
        }
        continue;
      }
    }
  }

  // Anything still open runs to the chequered flag.
  if (openSC) close(openSC, end);
  if (openRed) close(openRed, end);
  for (const n of Object.values(openYellow)) close(n, end);

  return out.sort((a, b) => a.tStart - b.tStart);
}

/** Fraction of [a0, a1] covered by [b0, b1]. */
export function overlapFraction(a0: number, a1: number, b0: number, b1: number): number {
  if (!(a1 > a0)) return 0;
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo ? (hi - lo) / (a1 - a0) : 0;
}
