import { describe, it, expect } from "vitest";
import { loadAllFixtures } from "./fixtures.ts";
import { buildSessionModel } from "../session/build.ts";
import { whatIfPitShift, whatIfRange } from "../analyses/whatIf.ts";

const races = loadAllFixtures().map(f => ({ slug: f.slug, model: buildSessionModel(f.inputs) })).filter(x => x.model.kind === "race");
let checkedAcrossFixtures = 0;

describe.each(races.map(r => [r.slug, r.model] as const))("what-if pit shift on %s", (_slug, model) => {
  const candidates = model.drivers.filter(d => d.pits.length && d.classification.status === "finished");

  it("a zero shift reproduces the race exactly", () => {
    let checked = 0;
    for (const d of candidates) {
      const r = whatIfPitShift(model, { driverNumber: d.driver.driver_number, shiftLaps: 0 });
      if (!r.ok) continue;
      checked++;
      expect(Math.abs(r.value.delta)).toBeLessThan(1e-6);
      expect(r.value.positionAfter).toBe(r.value.positionBefore);
      expect(r.value.laps.every(l => !l.changed)).toBe(true);
    }
    checkedAcrossFixtures += checked;
  });

  it("shifts stay inside the allowed range and give finite deltas with a bracketing interval", () => {
    for (const d of candidates.slice(0, 8)) {
      const range = whatIfRange(model, d.driver.driver_number);
      if (!range) continue;
      for (const k of [range[0], -2, 2, range[1]]) {
        const r = whatIfPitShift(model, { driverNumber: d.driver.driver_number, shiftLaps: k });
        if (!r.ok) continue;
        expect(r.value.shift).toBeGreaterThanOrEqual(range[0]);
        expect(r.value.shift).toBeLessThanOrEqual(range[1]);
        expect(Number.isFinite(r.value.delta)).toBe(true);
        expect(r.value.deltaRange[0]).toBeLessThanOrEqual(r.value.delta + 1e-6);
        expect(r.value.deltaRange[1]).toBeGreaterThanOrEqual(r.value.delta - 1e-6);
        // Only laps after the earlier of the two stop laps can change; neutralised laps never do.
        for (const l of r.value.laps) {
          if (l.lap <= Math.min(r.value.stop.lap, r.value.stop.newLap) - 1) expect(l.changed).toBe(false);
        }
        expect(Math.abs(r.value.delta)).toBeLessThan(150);
      }
    }
  });
});

describe("what-if coverage", () => {
  it("at least one fixture has a driver with two fitted stints around a stop", () => {
    expect(checkedAcrossFixtures).toBeGreaterThan(0);
  });
});
