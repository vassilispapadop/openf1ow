// What if the stop had come earlier or later? A counterfactual built from
// the driver's own stint fits: laps that change compound are re-predicted
// from the other stint's fitted degradation (fuel added back), laps that
// merely change tyre age are shifted along their own stint's slope, the pit
// laps keep the stop's measured cost, and neutralised laps are held fixed.
// The answer is a time delta with a range from the fits' intervals, and the
// finishing position that time would have bought against the field's real
// cumulative times.

import type { SessionModel, EnrichedLap, EnrichedStint, DriverSummary } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import type { Fit } from "../types/gated.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { LapFlag, hasFlag } from "../types/model.ts";
import { fuelKgAtLap } from "../session/fuel.ts";
import { compoundSummary } from "./degradation.ts";
import { pitLossFor, pitStopAnalysis } from "./pitstops.ts";
import { neutralisationImpact } from "./neutralisationImpact.ts";
import { median } from "../stats.ts";

const HELD = LapFlag.SC | LapFlag.VSC | LapFlag.RED | LapFlag.RESTART | LapFlag.LAP1;

export interface WhatIfOptions {
  driverNumber: number;
  stopIndex?: number;      // 0-based among the driver's stops (default 0)
  shiftLaps: number;       // negative = earlier
}

export interface WhatIfResult {
  driver: Driver;
  stop: { index: number; lap: number; newLap: number; from: string; to: string };
  shift: number;
  range: [number, number];          // allowed shifts for this stop
  baselineTotal: number;
  scenarioTotal: number;
  delta: number;                    // scenario − baseline (negative = quicker)
  deltaRange: [number, number];     // from the two fits' 95 % slope intervals
  positionBefore: number | null;
  positionAfter: number | null;
  extrapolatedLaps: number;         // laps predicted beyond the tyre ages the fit saw
  pooledFits: string[];             // compounds whose slope came from the field's pooled curve, not this stint
  pitCost: number;                  // seconds the stop costs against two flying laps
  pitCostSource: "green-flag stop" | "session median" | "measured under neutralisation";
  scStopCost: number | null;        // what a stop under the safety car cost drivers who took one this race (loss vs the field)
  movedUnderNeutralisation: boolean; // the what-if stop lands in a SC/VSC/red-flag lap
  laps: { lap: number; baseline: number; scenario: number; changed: boolean }[];
}

/** Predicted raw lap time on a compound at a tyre age, at a given lap's fuel load. */
function predict(model: SessionModel, fit: Fit, age: number, lap: number, slope = fit.slope): number {
  return fit.intercept + slope * age + fuelKgAtLap(model.fuel, lap) * model.fuel.secPerKg;
}

function stintsAround(d: DriverSummary, pitLap: number): { a: EnrichedStint; b: EnrichedStint } | null {
  const a = d.stints.find(s => s.lap_start <= pitLap && pitLap <= s.lap_end);
  const b = d.stints.find(s => s.lap_start === pitLap + 1) ?? d.stints.find(s => a && s.stint_number === a.stint_number + 1);
  return a && b ? { a, b } : null;
}

/** The shifts a stop can take without leaving either stint shorter than two laps. */
export function whatIfRange(model: SessionModel, driverNumber: number, stopIndex = 0): [number, number] | null {
  const d = model.byDriver[driverNumber];
  const stop = d?.pits.slice().sort((x, y) => (x.lap_number ?? 0) - (y.lap_number ?? 0))[stopIndex];
  if (!d || !stop?.lap_number) return null;
  const st = stintsAround(d, stop.lap_number);
  if (!st) return null;
  return [-(stop.lap_number - st.a.lap_start - 1), st.b.lap_end - stop.lap_number - 2];
}

/** The stint's own fit, or — when it has too few clear-air laps — the field's
 *  pooled slope for that compound with an intercept from this stint's clean
 *  laps. The result says which was used. */
function fitFor(model: SessionModel, s: EnrichedStint, ageOf: (lap: number) => number): { fit: Fit; pooled: boolean } | null {
  if (s.deg.ok) return { fit: s.deg.value, pooled: false };
  const cs = compoundSummary(model);
  const c = cs.ok ? cs.value.find(x => x.compound === s.compound) : null;
  const clean = s.laps.filter(l => l.clean && l.fuelCorrected != null && l.tyreAge != null);
  if (!c || clean.length < 3) return null;
  const slope = c.medianDeg;
  const intercept = median(clean.map(l => (l.fuelCorrected as number) - slope * ageOf(l.lap_number)));
  const half = Math.max(0.01, (c.degIqr[1] - c.degIqr[0]) / 2);
  return { fit: { slope, intercept, r2: 0, se: half / 2, ci95: [slope - half, slope + half], n: clean.length, residualStd: 0, robustSlope: slope }, pooled: true };
}

export function whatIfPitShift(model: SessionModel, opts: WhatIfOptions): Gated<WhatIfResult> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const d = model.byDriver[opts.driverNumber];
  if (!d) return gate("no_data");
  if (!model.coverage.pits) return gate("no_pits");
  const pits = d.pits.slice().sort((x, y) => (x.lap_number ?? 0) - (y.lap_number ?? 0));
  const stopIndex = opts.stopIndex ?? 0;
  const stop = pits[stopIndex];
  if (!stop?.lap_number) return gate("no_pits");
  const p = stop.lap_number;
  const st = stintsAround(d, p);
  if (!st) return gate("no_stints");
  const { a, b } = st;

  const range = whatIfRange(model, opts.driverNumber, stopIndex) as [number, number];
  const k = Math.max(range[0], Math.min(range[1], Math.round(opts.shiftLaps)));
  const p2 = p + k;

  const byLap = new Map<number, EnrichedLap>(d.laps.map(l => [l.lap_number, l]));
  const timed = d.laps.filter(l => l.lap_duration && l.lap_duration > 0).sort((x, y) => x.lap_number - y.lap_number);
  if (!timed.length) return gate("no_clean_laps");
  // Stop at the first untimed lap, as the delta trace does.
  let lastLap = 0;
  for (const l of timed) { if (l.lap_number !== lastLap + 1) break; lastLap = l.lap_number; }
  if (lastLap <= p + 1) return gate("retired_early");

  const ageA = (lap: number) => (byLap.get(a.lap_start)?.tyreAge ?? a.tyre_age_at_start) + (lap - a.lap_start);
  const ageB = (lap: number) => (byLap.get(b.lap_start)?.tyreAge ?? b.tyre_age_at_start) + (lap - b.lap_start);
  const FA = fitFor(model, a, ageA), FB = fitFor(model, b, ageB);
  if (!FA) return a.deg.ok ? gate("fit_unstable") : ({ ...a.deg, ok: false } as Gated<never>);
  if (!FB) return b.deg.ok ? gate("fit_unstable") : ({ ...b.deg, ok: false } as Gated<never>);
  const fa = FA.fit, fb = FB.fit;
  const pooledFits = [...(FA.pooled ? [a.compound] : []), ...(FB.pooled ? [b.compound] : [])];
  const maxAgeA = Math.max(...a.fitLaps.map(l => l.tyreAge as number), ageA(p));
  const maxAgeB = Math.max(...b.fitLaps.map(l => l.tyreAge as number), ageB(b.lap_end));

  // What the stop costs against two flying laps: this stop's green-flag loss
  // when it was one, else the session's median green-flag stop, else what the
  // in/out laps measured (a stop under the safety car reads cheap because the
  // field was slow, so it is the last resort).
  let pitCost: number;
  let pitCostSource: WhatIfResult["pitCostSource"];
  const own = pitLossFor(model, stop);
  if (own != null) { pitCost = own; pitCostSource = "green-flag stop"; }
  else {
    const ps = pitStopAnalysis(model);
    if (ps.ok && ps.value.pitLoss.ok) { pitCost = ps.value.pitLoss.value.median; pitCostSource = "session median"; }
    else {
      const inLap = byLap.get(p), outLap = byLap.get(p + 1);
      pitCost = (inLap?.lap_duration ?? 0) + (outLap?.lap_duration ?? 0) - (predict(model, fa, ageA(p), p) + predict(model, fb, ageB(p + 1), p + 1));
      pitCostSource = "measured under neutralisation";
    }
  }

  // A stop taken under a neutralisation costs far less against the field. Use
  // what such stops actually cost this race (median realised loss relative to
  // the field, from the neutralisation impact), else a null that leaves the
  // held laps untouched and is flagged in the notes.
  let scStopCost: number | null = null;
  const ni = neutralisationImpact(model);
  if (ni.ok) {
    const realised = ni.value.flatMap(w => w.rows.filter(r => r.pittedUnder && r.delta != null).map(r => Math.max(0, r.delta as number)));
    if (realised.length) scStopCost = median(realised);
  }
  const heldAt = (n: number) => { const l = byLap.get(n); return l ? hasFlag(l.flags, HELD) : false; };
  const movedUnderNeutralisation = k !== 0 && (heldAt(p2) || heldAt(p2 + 1));

  const build = (sa: number, sb: number) => {
    const rows: { lap: number; baseline: number; scenario: number; changed: boolean }[] = [];
    let extrapolated = 0;
    for (let n = 1; n <= lastLap; n++) {
      const l = byLap.get(n);
      const actual = l?.lap_duration ?? 0;
      let scenario = actual;
      let changed = false;
      const held = l ? hasFlag(l.flags, HELD) : false;
      if (k !== 0 && held && (n === p2 || n === p2 + 1) && scStopCost != null) {
        // The stop moves into a neutralised lap: the lap stays a SC lap, plus
        // half of what such a stop cost against the field this race.
        scenario = actual + scStopCost / 2; changed = true;
      } else if (k !== 0 && !held) {
        if (n === p2) { scenario = predict(model, fa, ageA(n), n, sa) + pitCost * 0.5; changed = true; if (ageA(n) > maxAgeA) extrapolated++; }
        else if (n === p2 + 1) { scenario = predict(model, fb, ageB(b.lap_start) + 0, n, sb) + pitCost * 0.5; changed = true; }
        else if (k > 0 && n > p && n < p2) { scenario = predict(model, fa, ageA(n), n, sa); changed = true; if (ageA(n) > maxAgeA) extrapolated++; }
        else if (k < 0 && n > p2 + 1 && n <= p + 1) { scenario = predict(model, fb, ageB(b.lap_start) + (n - p2 - 1), n, sb); changed = true; }
        else if (n > Math.max(p, p2) + 1 && n <= b.lap_end) {
          // Still a B lap, but k laps younger (k > 0) or older (k < 0).
          scenario = actual - k * sb; changed = true;
          if (k < 0 && ageB(n) - k > maxAgeB) extrapolated++;
        }
      }
      rows.push({ lap: n, baseline: actual, scenario, changed });
    }
    return { rows, extrapolated };
  };

  const main = build(fa.slope, fb.slope);
  const lo = build(fa.ci95[0], fb.ci95[0]);
  const hi = build(fa.ci95[1], fb.ci95[1]);
  const total = (rows: { scenario: number }[]) => rows.reduce((s, r) => s + r.scenario, 0);
  const baselineTotal = main.rows.reduce((s, r) => s + r.baseline, 0);
  const scenarioTotal = total(main.rows);
  const deltas = [total(lo.rows) - baselineTotal, total(hi.rows) - baselineTotal];

  // Position by cumulative time at the driver's last lap, against everyone who
  // completed that lap; the real classification decides ties.
  const position = (t: number): number | null => {
    let ahead = 0, seen = 0;
    for (const o of model.drivers) {
      if (o.driver.driver_number === d.driver.driver_number) continue;
      let acc = 0, okLaps = 0;
      for (const l of o.laps.slice().sort((x, y) => x.lap_number - y.lap_number)) {
        if (l.lap_number > lastLap) break;
        if (!l.lap_duration || l.lap_duration <= 0) break;
        acc += l.lap_duration; okLaps = l.lap_number;
      }
      if (okLaps < lastLap) { if ((o.classification.position ?? 99) < (d.classification.position ?? 99)) ahead++; continue; }
      seen++;
      if (acc < t) ahead++;
    }
    return seen || ahead ? ahead + 1 : null;
  };

  return ok({
    driver: d.driver,
    stop: { index: stopIndex, lap: p, newLap: p2, from: a.compound, to: b.compound },
    shift: k,
    range,
    baselineTotal, scenarioTotal,
    delta: scenarioTotal - baselineTotal,
    deltaRange: [Math.min(...deltas), Math.max(...deltas)],
    positionBefore: d.classification.position ?? position(baselineTotal),
    positionAfter: k === 0 ? (d.classification.position ?? position(baselineTotal)) : position(scenarioTotal),
    extrapolatedLaps: main.extrapolated,
    pooledFits,
    pitCost,
    pitCostSource,
    scStopCost,
    movedUnderNeutralisation,
    laps: main.rows,
  }, fa.n + fb.n,
  pooledFits.length || main.extrapolated > 3 ? "low" : a.deg.ok && b.deg.ok && a.deg.confidence === "high" && b.deg.confidence === "high" ? "medium" : "low",
  [
    ...(main.extrapolated ? [`${main.extrapolated} lap${main.extrapolated === 1 ? "" : "s"} predicted beyond the tyre ages the fit saw — the model assumes the slope holds; a cliff would make it worse.`] : []),
    ...(pooledFits.length ? [`${pooledFits.join(" and ")} slope taken from the field's pooled curve — this stint had too few clear-air laps for its own fit.`] : []),
    ...(movedUnderNeutralisation ? [scStopCost != null ? `The what-if stop lands under a neutralisation and is charged ${scStopCost.toFixed(1)} s — what stops under the safety car cost against the field in this race.` : "The what-if stop lands under a neutralisation; no stop was taken under one in this race, so its cost is unknown and left at zero."] : []),
    "Neutralisations are held where they happened; the stop's cost is fixed; nobody else reacts.",
  ]);
}
