// Undercut / overcut: what actually happened when two cars close on track
// pitted a lap or a few apart, from the real gaps. For every pair (A pits
// on lap p; B is within 3 s of A at the start of lap p and pits within the
// next four laps) the exchange is the change in their gap from the lap
// before the first stop to the lap after the second car's out-lap.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { GATES } from "../gates.ts";

const CLOSE_S = 3.0;
const MAX_LAPS_APART = 4;

export interface Exchange {
  first: Driver;             // pitted first
  second: Driver;
  firstStopLap: number;
  secondStopLap: number;
  lapsApart: number;
  gapBefore: number;         // seconds, first − second on track (negative = first was ahead), lap before the first stop
  gapAfter: number;          // same, first lap where both are past their out-laps
  delta: number;             // gapAfter − gapBefore: negative = the first stopper gained
  kind: "undercut" | "overcut";
  worked: boolean;           // the earlier stopper gained (undercut) / the later stopper gained (overcut)
  compoundFirst: string | null;
  compoundSecond: string | null;
}

export interface UndercutAnalysis {
  exchanges: Exchange[];
  undercutsWorked: number;
  undercutsTried: number;
  medianUndercutGain: number | null;   // seconds gained by pitting first, over the attempts
}

/** Signed on-track gap between a and b at the start of lap n: cumulative
 *  time difference from their lap timelines. Positive = a is behind b. */
function gapAtLapStart(a: EnrichedLap[], b: EnrichedLap[], lap: number): number | null {
  const la = a.find(l => l.lap_number === lap), lb = b.find(l => l.lap_number === lap);
  if (!la || !lb || !Number.isFinite(la.tStart) || !Number.isFinite(lb.tStart)) return null;
  return (la.tStart - lb.tStart) / 1000;
}

export function undercutAnalysis(model: SessionModel): Gated<UndercutAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.pits) return gate("no_pits");
  const exchanges: Exchange[] = [];
  const drivers = model.drivers.filter(d => d.laps.length);

  for (const A of drivers) {
    for (const pA of A.pits) {
      if (pA.underNeutralisation != null) continue;
      const p = pA.lap_number;
      for (const B of drivers) {
        if (B === A) continue;
        const gapBefore = gapAtLapStart(A.laps, B.laps, p);
        if (gapBefore == null || Math.abs(gapBefore) > CLOSE_S) continue;
        const pB = B.pits.find(x => x.lap_number > p && x.lap_number <= p + MAX_LAPS_APART && x.underNeutralisation == null);
        if (!pB) continue;
        // Both past their out-laps: the lap after B's out-lap.
        const settleLap = pB.lap_number + 2;
        const gapAfter = gapAtLapStart(A.laps, B.laps, settleLap);
        if (gapAfter == null) continue;
        const delta = gapAfter - gapBefore;
        const compoundAt = (d: typeof A, lap: number) => d.laps.find(l => l.lap_number === lap)?.compound ?? null;
        exchanges.push({
          first: A.driver, second: B.driver,
          firstStopLap: p, secondStopLap: pB.lap_number, lapsApart: pB.lap_number - p,
          gapBefore, gapAfter, delta,
          kind: "undercut",
          worked: delta < 0,
          compoundFirst: compoundAt(A, p + 2), compoundSecond: compoundAt(B, pB.lap_number + 2),
        });
      }
    }
  }
  // An exchange where the later stopper gained reads as an overcut that worked.
  for (const e of exchanges) if (!e.worked) { e.kind = "overcut"; e.worked = true; }
  // …but keep the undercut framing for the headline counts.
  const tried = exchanges.length;
  const undercutsWorked = exchanges.filter(e => e.delta < 0).length;
  if (tried < GATES.UNDERCUT_MIN_PAIRS) return gate("too_few_laps", tried, GATES.UNDERCUT_MIN_PAIRS);
  const gains = exchanges.map(e => -e.delta).sort((a, b) => a - b);
  exchanges.sort((a, b) => a.firstStopLap - b.firstStopLap);
  return ok({
    exchanges,
    undercutsWorked,
    undercutsTried: tried,
    medianUndercutGain: gains.length ? gains[gains.length >> 1] : null,
  }, tried, confidenceFromN(tried, 3), ["Gaps are from lap-start timestamps of the two cars; pit-lane loss is included in the exchange by construction."]);
}
