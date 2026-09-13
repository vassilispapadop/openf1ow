import { describe, it, expect } from "vitest";
import { deltaToFastest, elapsedByDistance, spansWhere, movingAverage } from "../telemetry/compare.ts";

const lap = (key: string, speedKph: number, n = 300, dist = 5000) => ({
  key, label: key, color: "ff0000",
  data: Array.from({ length: n }, (_, i) => {
    const d = (i / (n - 1)) * dist;
    return { date: new Date(1_700_000_000_000 + (d / (speedKph / 3.6)) * 1000).toISOString(), distance: d, speed: speedKph, drs: i > n / 2 ? 12 : 1 };
  }),
});

describe("lap comparison math", () => {
  it("elapsed is monotone and starts at zero", () => {
    const e = elapsedByDistance(lap("a", 200).data);
    expect(e[0].elapsed).toBe(0);
    for (let i = 1; i < e.length; i++) expect(e[i].elapsed).toBeGreaterThanOrEqual(e[i - 1].elapsed);
  });
  it("delta to fastest is ≥ 0 everywhere and 0 for the quicker lap", () => {
    const d = deltaToFastest([lap("slow", 180), lap("fast", 200)]);
    expect(d).not.toBeNull();
    const slow = d!.perTrace.find(p => p.key === "slow")!, fast = d!.perTrace.find(p => p.key === "fast")!;
    for (let i = 0; i < d!.grid.length; i++) {
      expect(slow.values[i]).toBeGreaterThanOrEqual(-1e-9);
      expect(fast.values[i]).toBeCloseTo(0, 6);
    }
    // 5 km at 180 vs 200 km/h: 100 s vs 90 s → 10 s behind at the end.
    expect(slow.values[slow.values.length - 1]).toBeCloseTo(10, 0);
  });
  it("needs two traces", () => { expect(deltaToFastest([lap("a", 200)])).toBeNull(); });
  it("spansWhere finds the DRS-open half", () => {
    const sp = spansWhere(lap("a", 200).data, s => s.drs === 12);
    expect(sp.length).toBe(1);
    expect(sp[0].from).toBeGreaterThan(2400);
    expect(sp[0].to).toBeCloseTo(5000, 0);
  });
  it("moving average preserves a constant and the mean", () => {
    expect(movingAverage([2, 2, 2, 2], 3)).toEqual([2, 2, 2, 2]);
    const xs = [0, 1, 0, 1, 0, 1, 0, 1];
    const m = movingAverage(xs, 3);
    expect(m.reduce((a, b) => a + b, 0) / m.length).toBeCloseTo(0.5, 1);
  });
});
