import { describe, it, expect } from "vitest";
import { loadAllFixtures } from "./fixtures.ts";
import { buildSessionModel } from "../session/build.ts";
import { topSpeeds } from "../analyses/speeds.ts";

describe.each(loadAllFixtures().map(f => [f.slug, buildSessionModel(f.inputs)] as const))("top speeds on %s", (_slug, model) => {
  it("ranks drivers by best trap, keeps clear ≤ best and tow ≤ best, and names a team best", () => {
    const r = topSpeeds(model);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value;
    for (let i = 1; i < v.drivers.length; i++) expect(v.drivers[i].trap?.speed ?? 0).toBeLessThanOrEqual(v.drivers[i - 1].trap?.speed ?? 0);
    for (const d of v.drivers) {
      if (d.trap) { expect(d.trap.speed).toBeGreaterThan(150); expect(d.trap.speed).toBeLessThan(400); }
      if (d.trapClear && d.trap) expect(d.trapClear.speed).toBeLessThanOrEqual(d.trap.speed);
      if (d.trapTow && d.trap) expect(d.trapTow.speed).toBeLessThanOrEqual(d.trap.speed);
      if (!v.towSplit) { expect(d.trapTow).toBeNull(); expect(d.trapClear?.speed).toBe(d.trap?.speed); }
    }
    expect(v.fieldBest.trap?.speed).toBe(v.drivers[0].trap?.speed);
    expect(v.teams[0].trap?.speed).toBe(v.fieldBest.trap?.speed);
    expect(v.towSplit).toBe(model.coverage.intervals);
  });
});
