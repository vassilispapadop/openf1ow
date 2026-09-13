import { describe, it, expect } from "vitest";
import { loadAllFixtures } from "./fixtures.ts";
import { buildSessionModel } from "../session/build.ts";
import { sessionClock, pushLaps, trackEvolution, sectorBests, teammateSingleLap, runPlan } from "../analyses/singleLap.ts";
import { generateVerdicts } from "../verdicts/index.ts";

const fixtures = loadAllFixtures();

describe.each(fixtures.map(f => [f.slug, f] as const))("single-lap analyses on %s", (_slug, fx) => {
  const model = buildSessionModel(fx.inputs);
  const clock = sessionClock(model);

  it("has a session clock with ordered phases covering the session", () => {
    expect(clock).not.toBeNull();
    const ph = clock!.phases;
    expect(ph.length).toBeGreaterThan(0);
    expect(ph[0].fromMin).toBe(0);
    for (let i = 1; i < ph.length; i++) expect(ph[i].fromMin).toBeGreaterThan(ph[i - 1].fromMin);
    expect(ph[ph.length - 1].toMin).toBeCloseTo(clock!.endMin, 6);
    if (model.kind === "qualifying") expect(ph.length).toBe(3);
    else expect(ph.length).toBe(1);
  });

  it("push laps are within 3 % of each driver's best and ranked by best", () => {
    const pl = pushLaps(model, clock);
    expect(pl.ok).toBe(true);
    if (!pl.ok) return;
    for (let i = 1; i < pl.value.length; i++) expect(pl.value[i].best).toBeGreaterThanOrEqual(pl.value[i - 1].best);
    for (const d of pl.value) {
      expect(d.laps.some(l => l.isBest)).toBe(true);
      for (const l of d.laps) expect(l.time).toBeLessThanOrEqual(d.best * 1.03 + 1e-9);
      // The phase best is never quicker than the session best.
      for (const b of d.phaseBests) if (b != null) expect(b).toBeGreaterThanOrEqual(d.best - 1e-9);
      expect(Math.min(...d.phaseBests.filter((b): b is number => b != null))).toBeCloseTo(d.best, 6);
    }
  });

  it("track evolution reports a finite slope with a CI around it, or a named gate", () => {
    const te = trackEvolution(model, clock);
    if (!te.ok) { expect(["too_few_laps", "fit_unstable", "no_clean_laps", "no_data"]).toContain(te.reason); return; }
    const v = te.value;
    expect(Number.isFinite(v.secPerMin)).toBe(true);
    expect(v.ci95[0]).toBeLessThanOrEqual(v.secPerMin);
    expect(v.ci95[1]).toBeGreaterThanOrEqual(v.secPerMin);
    expect(v.n).toBeGreaterThanOrEqual(30);
    expect(v.drivers).toBeGreaterThanOrEqual(8);
    expect(v.r2Within).toBeLessThanOrEqual(1);
  });

  it("sector bests: theoretical ≤ best, ultimate ≤ every theoretical, kings hold the field best", () => {
    const sb = sectorBests(model);
    expect(sb.ok).toBe(true);
    if (!sb.ok) return;
    const v = sb.value;
    for (const r of v.rows) {
      expect(r.theoretical).toBeLessThanOrEqual(r.best + 1e-9);
      expect(v.ultimateLap).toBeLessThanOrEqual(r.theoretical + 1e-9);
      expect(r.theoreticalRank).toBeLessThanOrEqual(r.actualRank);
      r.kings.forEach((k, i) => { if (k) expect(r.bests[i]).toBeCloseTo(v.fieldBests[i], 9); });
    }
    v.kings.forEach((k, i) => { expect(k).not.toBeNull(); expect(v.rows.find(r => r.driver.driver_number === k!.driver_number)!.bests[i]).toBeCloseTo(v.fieldBests[i], 9); });
  });

  it("teammate single-lap pairs name the faster driver consistently", () => {
    const tm = teammateSingleLap(model, clock);
    if (!tm.ok) return;
    for (const p of tm.value) {
      const aFaster = p.bestA <= p.bestB;
      expect(p.faster.driver_number).toBe(aFaster ? p.a.driver_number : p.b.driver_number);
      expect(p.gap).toBeCloseTo(Math.abs(p.bestA - p.bestB), 9);
      expect(p.winsA + p.winsB).toBeLessThanOrEqual(p.phases.length);
    }
  });

  it("run plan spans lie inside the session clock", () => {
    const rp = runPlan(model, clock);
    if (!rp.ok) return;
    for (const d of rp.value) for (const r of d.runs) {
      expect(r.fromMin).toBeGreaterThanOrEqual(-1e-6);
      expect(r.toMin).toBeLessThanOrEqual(clock!.endMin + 1e-6);
      expect(r.toMin).toBeGreaterThanOrEqual(r.fromMin);
      expect(r.pushLaps).toBeLessThanOrEqual(r.laps);
    }
  });

  it("verdicts exist for every session kind and carry evidence anchors", () => {
    const vs = generateVerdicts(model);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) { expect(v.evidence.sectionId).toBeTruthy(); expect(v.headline.length).toBeGreaterThan(10); }
    if (model.kind !== "race") {
      expect(vs.some(v => v.id === "pole" || v.id === "fastest_practice_lap")).toBe(true);
      expect(vs.filter(v => v.kpi).length).toBeGreaterThanOrEqual(2);
    } else {
      expect(vs.some(v => v.id === "race_winner" && v.kpi)).toBe(true);
    }
  });
});
