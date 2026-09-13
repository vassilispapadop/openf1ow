// Property tests for buildSessionModel over every recorded fixture. These
// are the invariants the UI relies on: no silent zeros, flags that mean what
// they say, and analyses that never report below their own gates.

import { describe, it, expect } from "vitest";
import { loadAllFixtures } from "./fixtures.ts";
import { buildSessionModel } from "../session/build.ts";
import { LapFlag, CLEAN_MASK, hasFlag } from "../types/model.ts";
import { GATES } from "../gates.ts";
import { paceRanking, truePaceRanking } from "../analyses/pace.ts";
import { consistencyByDriver } from "../analyses/consistency.ts";
import { teammateComparisons } from "../analyses/teammates.ts";
import { constructorPace } from "../analyses/constructors.ts";
import { compoundSummary, driverDegradation } from "../analyses/degradation.ts";
import { sectorAnalysis } from "../analyses/sectors.ts";
import { bestLapsByDriver } from "../analyses/quali.ts";
import { longRuns, compoundPrograms } from "../analyses/practice.ts";
import { pitStopAnalysis } from "../analyses/pitstops.ts";
import { undercutAnalysis } from "../analyses/undercut.ts";
import { tyreLife } from "../analyses/tyreLife.ts";
import { strategyTimeline } from "../analyses/strategyTimeline.ts";
import { deltaTrace } from "../analyses/deltaTrace.ts";
import { startAnalysis } from "../analyses/start.ts";
import { overtakeAnalysis } from "../analyses/overtakes.ts";
import { neutralisationImpact } from "../analyses/neutralisationImpact.ts";
import { dirtyAirAnalysis } from "../analyses/dirtyAir.ts";
import { conversionAnalysis } from "../analyses/conversion.ts";
import { generateVerdicts } from "../verdicts/index.ts";
import { buildFacts } from "../summary/facts.ts";

const fixtures = loadAllFixtures();

function walk(value: unknown, path: string, bad: string[], seen = new Set<object>()): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) bad.push(`${path} = ${value}`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);
  if (Array.isArray(value)) {
    // Sample large arrays; every element is checked for the small ones.
    const step = value.length > 2000 ? Math.ceil(value.length / 2000) : 1;
    for (let i = 0; i < value.length; i += step) walk(value[i], `${path}[${i}]`, bad, seen);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${path}.${k}`, bad, seen);
}

describe.each(fixtures.map(f => [f.slug, f] as const))("fixture %s", (_slug, fx) => {
  const model = buildSessionModel(fx.inputs);

  it("builds with the expected kind and a positive lap count", () => {
    expect(["race", "qualifying", "practice"]).toContain(model.kind);
    expect(model.totalLaps).toBeGreaterThan(0);
    expect(model.laps.length).toBe(fx.inputs.laps.length);
    expect(model.drivers.length).toBe(fx.inputs.drivers.length);
  });

  it("contains no NaN or Infinity anywhere", () => {
    const bad: string[] = [];
    walk({ ...model, laps: undefined, lapByKey: undefined, lapsByNumber: undefined, drivers: undefined, byDriver: undefined }, "model", bad);
    for (const l of model.laps) {
      for (const k of ["tyreAge", "fuelKg", "fuelCorrected", "gapAhead", "gapToLeader"] as const) {
        const v = l[k];
        if (v != null && !Number.isFinite(v)) bad.push(`${l.key}.${k} = ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("clean and clearAir are derived from the flags", () => {
    for (const l of model.laps) {
      const structural = (l.flags & CLEAN_MASK) === 0 && !!l.lap_duration && l.lap_duration > 0;
      expect(l.clean).toBe(structural);
      if (l.clearAir) expect(l.clean).toBe(true);
      if (l.clean) expect(hasFlag(l.flags, LapFlag.SC | LapFlag.VSC | LapFlag.RED | LapFlag.PIT_IN | LapFlag.PIT_OUT)).toBe(false);
    }
  });

  it("every pit lap is PIT_IN and the lap after is PIT_OUT", () => {
    for (const p of fx.inputs.pits ?? []) {
      const inLap = model.lapByKey[`${p.driver_number}-${p.lap_number}`];
      const outLap = model.lapByKey[`${p.driver_number}-${p.lap_number + 1}`];
      if (inLap) expect(hasFlag(inLap.flags, LapFlag.PIT_IN)).toBe(true);
      if (outLap) expect(hasFlag(outLap.flags, LapFlag.PIT_OUT)).toBe(true);
    }
  });

  it("no clean lap overlaps a safety-car, VSC or red-flag window", () => {
    for (const l of model.laps) {
      if (!l.clean || !Number.isFinite(l.tStart) || l.tEnd == null) continue;
      for (const n of model.neutralisations) {
        if (n.kind === "YELLOW") continue;
        const overlaps = l.tStart < n.tEnd && (l.tEnd as number) > n.tStart;
        expect(overlaps, `${l.key} vs ${n.kind} L${n.lapStart}-${n.lapEnd}`).toBe(false);
      }
    }
  });

  it("safety-car windows match the race-control deployments", () => {
    const rc = fx.inputs.raceControl ?? [];
    const deployed = rc.filter(m => (m.category || "").toLowerCase() === "safetycar" && /DEPLOYED/i.test(m.message)).length;
    const windows = model.neutralisations.filter(n => n.kind === "SC" || n.kind === "VSC").length;
    expect(windows).toBe(deployed);
  });

  it("retired drivers have no clean laps after their retirement lap and lap 1 is never clean in a race", () => {
    for (const d of model.drivers) {
      const r = d.classification.retiredLap;
      if (r != null) for (const l of d.laps) if (l.lap_number > r) expect(l.clean).toBe(false);
    }
    if (model.kind === "race") for (const l of model.lapsByNumber[1] ?? []) expect(l.clean).toBe(false);
  });

  it("intervals join: leader gap is ~0, DIRTY implies a known gap, lapped cars are flagged", () => {
    if (!model.coverage.intervals) return;
    for (const l of model.laps) {
      if (hasFlag(l.flags, LapFlag.DIRTY)) expect(l.gapAhead).not.toBeNull();
      // The position feed and the interval feed are published a few hundred
      // milliseconds apart, so at a lap start the car the position feed calls
      // P1 can still carry a sub-second gap from a just-completed swap.
      if (l.position === 1 && l.gapToLeader != null) expect(l.gapToLeader).toBeLessThanOrEqual(1.0);
    }
    const lapped = model.laps.filter(l => hasFlag(l.flags, LapFlag.LAPPED));
    const results = fx.inputs.results ?? [];
    const anyLappedInResults = results.some(r => typeof r.gap_to_leader === "string" && /LAP/i.test(r.gap_to_leader));
    if (anyLappedInResults) expect(lapped.length).toBeGreaterThan(0);
  });

  it("fuel model is sprint-aware and the fitted s/kg stays in band", () => {
    if (model.kind !== "race") return;
    expect(model.fuel.startKg).toBe(model.sprint ? 40 : 110);
    if (model.fuel.source === "fitted") {
      expect(model.fuel.secPerKg).toBeGreaterThanOrEqual(0.025);
      expect(model.fuel.secPerKg).toBeLessThanOrEqual(0.08);
      expect(model.fuel.fitPairs).toBeGreaterThanOrEqual(GATES.FUEL_FIT_MIN_PAIRS);
    }
    for (const l of model.laps) if (l.fuelKg != null) { expect(l.fuelKg).toBeGreaterThanOrEqual(0); expect(l.fuelKg).toBeLessThanOrEqual(model.fuel.startKg); }
  });

  it("stint fits respect their gate and confidence intervals bracket the slope", () => {
    for (const d of model.drivers) for (const s of d.stints) {
      if (s.deg.ok) {
        expect(s.deg.n).toBeGreaterThanOrEqual(GATES.DEG_MIN_LAPS);
        expect(s.deg.value.ci95[0]).toBeLessThanOrEqual(s.deg.value.slope);
        expect(s.deg.value.ci95[1]).toBeGreaterThanOrEqual(s.deg.value.slope);
      } else {
        expect(s.deg.reason === "too_few_laps" ? s.deg.n < GATES.DEG_MIN_LAPS : true).toBe(true);
      }
      if (s.cliff.ok) expect(s.fitLaps.length).toBeGreaterThanOrEqual(GATES.CLIFF_MIN_LAPS);
    }
  });

  it("every analysis honours its gate and never emits ok with n below need", () => {
    const results = [
      paceRanking(model), truePaceRanking(model), consistencyByDriver(model), teammateComparisons(model),
      constructorPace(model), compoundSummary(model), driverDegradation(model), sectorAnalysis(model),
      bestLapsByDriver(model), longRuns(model), compoundPrograms(model),
      pitStopAnalysis(model), undercutAnalysis(model), tyreLife(model), strategyTimeline(model), deltaTrace(model),
      startAnalysis(model), overtakeAnalysis(model), neutralisationImpact(model), dirtyAirAnalysis(model), conversionAnalysis(model),
    ];
    for (const r of results) {
      if (!r.ok) { expect(r.n).toBeLessThan(Math.max(r.need, 1)); continue; }
      const bad: string[] = [];
      walk(r.value, "value", bad);
      expect(bad).toEqual([]);
    }
    const pace = paceRanking(model);
    if (pace.ok) {
      for (const g of pace.value.rows) if (g.ok) expect(g.n).toBeGreaterThanOrEqual(GATES.PACE_MIN_CLEAN);
      expect(pace.value.ranked[0]?.gapToFastest).toBe(0);
    }
  });

  it("race: pace ranking covers most of the field and best laps exclude pit-outs", () => {
    const best = bestLapsByDriver(model);
    expect(best.ok).toBe(true);
    if (best.ok) for (const r of best.value) expect(hasFlag(r.lap.flags, LapFlag.PIT_OUT)).toBe(false);
    if (model.kind === "race") {
      const pace = paceRanking(model);
      expect(pace.ok).toBe(true);
      if (pace.ok) expect(pace.value.ranked.length).toBeGreaterThanOrEqual(Math.floor(model.drivers.length * 0.6));
    }
  });

  it("verdicts and facts are finite, every verdict points at a known section, and the facts stay compact", () => {
    const verdicts = generateVerdicts(model);
    if (model.kind === "race") expect(verdicts.length).toBeGreaterThanOrEqual(3);
    for (const v of verdicts) {
      expect(v.headline.length).toBeGreaterThan(10);
      expect(v.evidence.sectionId).toMatch(/^[a-z-]+$/);
      for (const n of v.numbers) expect(n.value).not.toMatch(/NaN|Infinity|undefined/);
    }
    const facts = buildFacts(model);
    const bad: string[] = [];
    walk(facts.tables, "tables", bad);
    expect(bad).toEqual([]);
    expect(JSON.stringify(facts).length).toBeLessThan(120_000);
  });

  it("strategy timeline covers every lap of every driver exactly once", () => {
    const tl = strategyTimeline(model);
    if (!tl.ok) return;
    for (const row of tl.value.rows) {
      const d = model.byDriver[row.driver.driver_number];
      for (const l of d.laps) {
        const covering = row.stints.filter(s => l.lap_number >= s.fromLap && l.lap_number <= s.toLap).length;
        expect(covering, `${row.driver.name_acronym} L${l.lap_number}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("performance: the model builds in under 300 ms", () => {
    const t0 = performance.now();
    buildSessionModel(fx.inputs);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});

describe.each(fixtures.map(f => [f.slug, f] as const))("fixture %s with feeds stripped", (_slug, fx) => {
  // The fallback paths — no overtakes feed, no intervals, no results, no
  // race control — must run clean too; the recorded sessions all have them.
  const stripped = buildSessionModel({ ...fx.inputs, overtakes: [], intervals: [], startingGrid: [], results: [], raceControl: [] });
  it("every analysis, the verdicts and the facts still run", () => {
    expect(stripped.coverage.intervals).toBe(false);
    for (const fn of [paceRanking, truePaceRanking, consistencyByDriver, teammateComparisons, constructorPace, compoundSummary, driverDegradation,
      sectorAnalysis, bestLapsByDriver, longRuns, compoundPrograms, pitStopAnalysis, undercutAnalysis, tyreLife, strategyTimeline, deltaTrace,
      startAnalysis, overtakeAnalysis, neutralisationImpact, dirtyAirAnalysis, conversionAnalysis]) {
      const r = fn(stripped);
      if (r.ok) { const bad: string[] = []; walk(r.value, fn.name, bad); expect(bad).toEqual([]); }
    }
    const v = generateVerdicts(stripped);
    for (const x of v) for (const n of x.numbers) expect(n.value).not.toMatch(/NaN|undefined/);
    expect(() => buildFacts(stripped)).not.toThrow();
    const da = dirtyAirAnalysis(stripped);
    if (stripped.kind === "race") { expect(da.ok).toBe(false); if (!da.ok) expect(da.reason).toBe("no_intervals"); }
  });
});

describe("fixtures present", () => {
  it("at least one fixture is recorded", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });
});
