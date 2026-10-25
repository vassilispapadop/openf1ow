import { describe, it, expect } from "vitest";
import { deltaToFastest, elapsedByDistance, spansWhere, movingAverage, clipToLap, anchorToLap, type LapTrace } from "../telemetry/compare.ts";

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

// OpenF1 telemetry is fetched from the lap's start to two seconds past its end:
// the first sample falls a little after the line, by a different amount each
// lap, and the tail runs into the next lap.
const DT = 0.27;
const LINE = 1_700_000_000_000;
function windowed(key: string, speedKph: number, leadS: number, tailKph = speedKph, dist = 5000): LapTrace {
  const v = speedKph / 3.6;
  const duration = dist / v;
  const data = [];
  for (let t = leadS; t <= duration + 2; t += DT) {
    // After the line the car may lift (tailKph); distance counts from the first sample.
    const past = Math.max(0, t - duration);
    const d = v * (t - past) + (tailKph / 3.6) * past - v * leadS;
    data.push({ date: new Date(LINE + t * 1000).toISOString(), distance: d, speed: t > duration ? tailKph : speedKph, throttle: t > duration && tailKph < speedKph ? 0 : 100 });
  }
  return { key, label: key, color: "00ff00", data, lap: { dateStart: new Date(LINE).toISOString(), duration } };
}

describe("lap anchoring", () => {
  it("clipToLap cuts exactly at the line and at the lap's end", () => {
    const t = windowed("a", 250, 0.26);
    const c = clipToLap(t.data, t.lap!);
    expect(new Date(c[0].date).getTime()).toBe(LINE);
    expect(new Date(c[c.length - 1].date).getTime()).toBeCloseTo(LINE + t.lap!.duration * 1000, -1);
    // The first sample was 0.26 s past the line at 250 km/h = ~18 m, so the line is that far back.
    expect(c[0].distance!).toBeCloseTo(-0.26 * 250 / 3.6, 0);
    expect(c[c.length - 1].distance! - c[0].distance!).toBeCloseTo(5000, 0);
  });

  it("leaves data that doesn't cover the lap alone", () => {
    const t = windowed("a", 250, 0.26);
    const short = t.data.slice(0, 50);
    expect(clipToLap(short, t.lap!)).toBe(short);
  });

  it("two cars at the same pace read level whatever their window lead or tail", () => {
    // Raw distance-from-first-sample put the lap with the later first sample ~0.1–0.2 s ahead.
    const a = windowed("a", 250, 0.0), b = windowed("b", 250, 0.26, 150);
    const raw = deltaToFastest([a, b], 400, 1)!;
    expect(Math.max(...raw.perTrace.flatMap(p => p.values))).toBeGreaterThan(0.1);
    const d = deltaToFastest(anchorToLap([a, b]), 400, 1)!;
    expect(Math.max(...d.perTrace.flatMap(p => p.values))).toBeLessThan(0.03);
  });

  it("the delta at the line is the lap-time gap, and a lift after the line doesn't leak in", () => {
    const fast = windowed("fast", 250, 0.05, 250), slow = windowed("slow", 245, 0.26, 120);
    const d = deltaToFastest(anchorToLap([fast, slow]), 400, 1)!;
    const gap = slow.lap!.duration - fast.lap!.duration;
    const end = d.perTrace.find(p => p.key === "slow")!.values;
    expect(end[end.length - 1]).toBeCloseTo(gap, 2);
    expect(Math.abs(d.maxDist - 5000)).toBeLessThan(2);
  });
});
