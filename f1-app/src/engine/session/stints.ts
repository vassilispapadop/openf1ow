// Stints with a proper degradation fit: slope with its standard error and
// 95 % interval, R², a Theil–Sen cross-check, and a two-segment test for a
// cliff. Negative slopes are allowed — tyres switching on, or a track
// rubbering in, is information, not an error to clamp away.

import type { Stint } from "../types/raw.ts";
import { LapFlag, type Cliff, type EnrichedLap, type EnrichedStint } from "../types/model.ts";
import { type Fit, type Gated, ok, gate, downgrade, type Confidence } from "../types/gated.ts";
import { olsFit, twoSegmentFit, medianOrNull } from "../stats.ts";
import { GATES } from "../gates.ts";

const CLIFF_MIN_DELTA_BIC = 6;
const CLIFF_MIN_SLOPE_JUMP = 0.15;

function degConfidence(fit: Fit): Confidence {
  let c: Confidence = fit.n >= 15 ? "high" : fit.n >= 8 ? "medium" : "low";
  if (Math.abs(fit.slope - fit.robustSlope) > fit.se && fit.se > 0) c = downgrade(c);
  if (fit.r2 < 0.2) c = downgrade(c);
  return c;
}

export function fitDegradation(fitLaps: EnrichedLap[]): Gated<Fit> {
  const n = fitLaps.length;
  if (n < GATES.DEG_MIN_LAPS) return gate("too_few_laps", n, GATES.DEG_MIN_LAPS);
  const xs = fitLaps.map(l => l.tyreAge as number);
  const ys = fitLaps.map(l => l.fuelCorrected as number);
  const fit = olsFit(xs, ys);
  if (!fit) return gate("fit_unstable", n, GATES.DEG_MIN_LAPS);
  return ok(fit, n, degConfidence(fit));
}

export function detectCliff(fitLaps: EnrichedLap[], deg: Gated<Fit>): Gated<Cliff> {
  const n = fitLaps.length;
  if (n < GATES.CLIFF_MIN_LAPS) return gate("too_few_laps", n, GATES.CLIFF_MIN_LAPS);
  if (!deg.ok) return gate("fit_unstable", n, GATES.CLIFF_MIN_LAPS);
  const sorted = [...fitLaps].sort((a, b) => (a.tyreAge as number) - (b.tyreAge as number));
  const xs = sorted.map(l => l.tyreAge as number);
  const ys = sorted.map(l => l.fuelCorrected as number);
  const two = twoSegmentFit(xs, ys, 4);
  if (!two) return gate("fit_unstable", n, GATES.CLIFF_MIN_LAPS);
  const jump = two.after.slope - two.before.slope;
  const needJump = Math.max(CLIFF_MIN_SLOPE_JUMP, 3 * deg.value.se);
  if (two.deltaBic > CLIFF_MIN_DELTA_BIC && jump > needJump) {
    return ok(
      { atTyreAge: xs[two.splitAt], slopeBefore: two.before.slope, slopeAfter: two.after.slope, deltaBic: two.deltaBic },
      n,
      two.deltaBic > 12 ? "high" : "medium",
    );
  }
  // No cliff is a valid, reportable result — but it is not a value, so the
  // gate carries the reason.
  return gate("fit_unstable", n, GATES.CLIFF_MIN_LAPS);
}

/** Build EnrichedStints for one driver from that driver's enriched laps. */
export function enrichStints(stints: Stint[], lapsByDriver: Record<number, EnrichedLap[]>): EnrichedStint[] {
  const out: EnrichedStint[] = [];
  for (const st of stints) {
    const all = (lapsByDriver[st.driver_number] ?? []).filter(l => l.lap_number >= st.lap_start && l.lap_number <= st.lap_end);
    const fitLaps = all.filter(l =>
      l.clean && l.clearAir && l.tyreAge != null && l.tyreAge >= 2 && !(l.flags & LapFlag.PIT_IN) && l.fuelCorrected != null);
    const deg = fitDegradation(fitLaps);
    out.push({
      ...st,
      compound: (st.compound || "UNKNOWN").toUpperCase(),
      driverNumber: st.driver_number,
      laps: all,
      fitLaps,
      deg,
      cliff: detectCliff(fitLaps, deg),
      medianClear: medianOrNull(fitLaps.map(l => l.fuelCorrected as number)),
      lengthLaps: Math.max(0, st.lap_end - st.lap_start + 1),
    });
  }
  return out.sort((a, b) => a.driver_number - b.driver_number || a.stint_number - b.stint_number);
}
