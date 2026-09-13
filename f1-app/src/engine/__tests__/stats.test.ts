import { describe, it, expect } from "vitest";
import {
  median, medianOrNull, sampleStd, mad, quantile, olsFit, theilSen,
  bootstrapMedianCI, pairedSignTest, twoSegmentFit, lastIndexLE, tCrit95,
} from "../stats.ts";

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("throws on an empty sample instead of returning 0", () => {
    expect(() => median([])).toThrow();
    expect(medianOrNull([])).toBeNull();
  });
});

describe("dispersion", () => {
  it("sample σ uses n − 1", () => {
    expect(sampleStd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(sampleStd([1])).toBe(0);
  });
  it("MAD is scaled to σ for normal data and ignores one outlier", () => {
    const xs = [90, 90.1, 89.9, 90.05, 89.95, 95];
    expect(mad(xs)).toBeLessThan(0.3);
    expect(sampleStd(xs)).toBeGreaterThan(1.5);
  });
  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });
});

describe("olsFit", () => {
  it("recovers a perfect line with r² = 1 and zero standard error", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const f = olsFit(xs, xs.map(x => 90 + 0.08 * x));
    expect(f).not.toBeNull();
    expect(f!.slope).toBeCloseTo(0.08, 9);
    expect(f!.intercept).toBeCloseTo(90, 9);
    expect(f!.r2).toBeCloseTo(1, 9);
    expect(f!.se).toBeCloseTo(0, 9);
    expect(f!.robustSlope).toBeCloseTo(0.08, 9);
  });
  it("returns null with fewer than 3 points or no x variance", () => {
    expect(olsFit([1, 2], [1, 2])).toBeNull();
    expect(olsFit([2, 2, 2], [1, 2, 3])).toBeNull();
  });
  it("allows a negative slope", () => {
    const f = olsFit([0, 1, 2, 3], [92, 91.9, 91.8, 91.7]);
    expect(f!.slope).toBeCloseTo(-0.1, 9);
  });
  it("confidence interval brackets the slope and widens with noise", () => {
    const xs = Array.from({ length: 12 }, (_, i) => i);
    const ys = xs.map(x => 90 + 0.05 * x + (x % 2 ? 0.1 : -0.1));
    const f = olsFit(xs, ys)!;
    expect(f.ci95[0]).toBeLessThanOrEqual(f.slope);
    expect(f.ci95[1]).toBeGreaterThanOrEqual(f.slope);
    expect(f.se).toBeGreaterThan(0);
  });
});

describe("theilSen", () => {
  it("is robust to a single bad point where OLS is pulled", () => {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7];
    const ys = xs.map(x => 90 + 0.05 * x);
    ys[3] += 3; // one traffic lap
    expect(theilSen(xs, ys)).toBeCloseTo(0.05, 2);
    expect(Math.abs(olsFit(xs, ys)!.slope - 0.05)).toBeGreaterThan(0.02);
  });
});

describe("bootstrapMedianCI", () => {
  it("is deterministic and contains the sample median", () => {
    const xs = [90.1, 90.3, 90.2, 90.5, 90.0, 90.4, 90.25, 90.35];
    const a = bootstrapMedianCI(xs);
    const b = bootstrapMedianCI(xs);
    expect(a).toEqual(b);
    expect(a[0]).toBeLessThanOrEqual(median(xs));
    expect(a[1]).toBeGreaterThanOrEqual(median(xs));
  });
});

describe("pairedSignTest", () => {
  it("is 1 for a balanced split and small for a one-sided one", () => {
    expect(pairedSignTest([1, -1, 1, -1])).toBeCloseTo(1, 6);
    expect(pairedSignTest(new Array(12).fill(0.1))).toBeLessThan(0.001);
    expect(pairedSignTest([0, 0, 0])).toBe(1);
  });
});

describe("twoSegmentFit", () => {
  it("finds a cliff and reports a BIC improvement", () => {
    const xs = Array.from({ length: 16 }, (_, i) => i + 2);
    const ys = xs.map(x => (x < 12 ? 90 + 0.03 * x : 90 + 0.03 * 12 + 0.5 * (x - 12)));
    const two = twoSegmentFit(xs, ys, 4)!;
    expect(two).not.toBeNull();
    expect(xs[two.splitAt]).toBeGreaterThanOrEqual(11);
    expect(xs[two.splitAt]).toBeLessThanOrEqual(13);
    expect(two.after.slope).toBeGreaterThan(two.before.slope + 0.3);
    expect(two.deltaBic).toBeGreaterThan(6);
  });
  it("does not invent a cliff on a straight line with noise", () => {
    const xs = Array.from({ length: 16 }, (_, i) => i + 2);
    const ys = xs.map(x => 90 + 0.05 * x + (x % 3 === 0 ? 0.05 : -0.03));
    const two = twoSegmentFit(xs, ys, 4);
    if (two) expect(two.after.slope - two.before.slope).toBeLessThan(0.15);
  });
});

describe("helpers", () => {
  it("lastIndexLE finds the last element ≤ target", () => {
    const arr = [1, 3, 5, 7];
    expect(lastIndexLE(arr, x => x, 0)).toBe(-1);
    expect(lastIndexLE(arr, x => x, 3)).toBe(1);
    expect(lastIndexLE(arr, x => x, 6)).toBe(2);
    expect(lastIndexLE(arr, x => x, 100)).toBe(3);
  });
  it("tCrit95 approaches 1.96 for large df", () => {
    expect(tCrit95(5)).toBeCloseTo(2.571, 3);
    expect(tCrit95(1000)).toBeCloseTo(1.962, 2);
  });
});
