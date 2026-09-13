// Teammate comparison on paired laps: the same lap number, both clean, and
// in the *same* traffic state — both in clear air or both behind a car.
// Requiring clear air for both would leave a driver who spent the race in a
// train with a handful of laps; requiring the same state keeps the sample and
// still stops one driver's traffic being read as the other's pace. Times are
// fuel-corrected (fuel is equal anyway; tyre-age difference is reported, not
// corrected). The median paired delta carries a bootstrap interval and a
// sign-test p-value, and the head-to-head lap count uses the same paired set
// — so the two figures can never name different winners.
//
// Every driver on a team is considered; the primary pair is the two with the
// most shared laps, and the rest are listed too.

import type { SessionModel, DriverSummary } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median, bootstrapMedianCI, pairedSignTest } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface TeammatePair {
  team: string;
  a: Driver;
  b: Driver;
  faster: Driver;
  slower: Driver;
  gap: number;               // sec, median of (slower − faster) on paired laps, ≥ 0
  ci95: [number, number];    // on the signed median delta (a − b)
  medianDelta: number;       // a − b, sec
  pValue: number;            // paired sign test
  significant: boolean;      // CI excludes zero and n ≥ 10
  n: number;
  winsA: number;             // laps a was quicker
  winsB: number;
  tyreAgeDiff: number;       // median (ageA − ageB) over the paired laps
  perLap: { lap: number; delta: number }[];   // a − b, for the lap-by-lap chart
}

export interface TeamComparison {
  team: string;
  primary: TeammatePair;
  others: TeammatePair[];
}

function pairFor(team: string, A: DriverSummary, B: DriverSummary): Gated<TeammatePair> {
  const byLapB = new Map<number, typeof B.laps[number]>();
  for (const l of B.laps) if (l.clean && l.fuelCorrected != null) byLapB.set(l.lap_number, l);
  const deltas: number[] = [];
  const perLap: { lap: number; delta: number }[] = [];
  const ageDiffs: number[] = [];
  for (const la of A.laps) {
    if (!la.clean || la.fuelCorrected == null) continue;
    const lb = byLapB.get(la.lap_number);
    if (!lb) continue;
    // Same traffic state only (see header).
    if (la.clearAir !== lb.clearAir) continue;
    const d = la.fuelCorrected - (lb.fuelCorrected as number);
    deltas.push(d);
    perLap.push({ lap: la.lap_number, delta: d });
    if (la.tyreAge != null && lb.tyreAge != null) ageDiffs.push(la.tyreAge - lb.tyreAge);
  }
  const n = deltas.length;
  if (n < GATES.TEAMMATE_MIN_PAIRED) return gate(n ? "too_few_laps" : "no_clean_laps", n, GATES.TEAMMATE_MIN_PAIRED);
  const med = median(deltas);
  const ci = bootstrapMedianCI(deltas);
  const p = pairedSignTest(deltas);
  const aFaster = med <= 0;
  const winsA = deltas.filter(d => d < 0).length;
  const winsB = deltas.filter(d => d > 0).length;
  const significant = (ci[0] > 0 || ci[1] < 0) && n >= 10;
  return ok({
    team,
    a: A.driver, b: B.driver,
    faster: aFaster ? A.driver : B.driver,
    slower: aFaster ? B.driver : A.driver,
    gap: Math.abs(med),
    ci95: ci,
    medianDelta: med,
    pValue: p,
    significant,
    n,
    winsA, winsB,
    tyreAgeDiff: ageDiffs.length ? median(ageDiffs) : 0,
    perLap,
  }, n, significant ? "high" : confidenceFromN(n, GATES.TEAMMATE_MIN_PAIRED));
}

export function teammateComparisons(model: SessionModel): Gated<TeamComparison[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const out: TeamComparison[] = [];
  for (const team of Object.values(model.teams)) {
    const ds = team.drivers.map(d => model.byDriver[d.driver_number]).filter(Boolean);
    if (ds.length < 2) continue;
    const pairs: TeammatePair[] = [];
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const p = pairFor(team.name, ds[i], ds[j]);
      if (p.ok) pairs.push(p.value);
    }
    if (!pairs.length) continue;
    pairs.sort((a, b) => b.n - a.n);
    out.push({ team: team.name, primary: pairs[0], others: pairs.slice(1) });
  }
  if (!out.length) return gate("too_few_laps", 0, GATES.TEAMMATE_MIN_PAIRED);
  out.sort((a, b) => b.primary.gap - a.primary.gap);
  return ok(out, out.length, "medium");
}
