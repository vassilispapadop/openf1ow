import { describe, it, expect } from "vitest";
import { compareLapSegments, type SegmentTrace } from "../telemetry/lapSegments.ts";
import { frozenCarDataMask } from "../telemetry/telemetry.ts";

// A synthetic circuit drawn as a sequence of pieces, each with a radius (0 =
// straight), a sweep in degrees and the speed the car carries through it.
// Speed ramps linearly between pieces so braking shows in the trace the way
// it does in car_data. Positions are decimetres, like OpenF1's location feed.
interface Piece { radius: number; sweepDeg?: number; length?: number; speed: number; sign?: 1 | -1 }

const LAYOUT: Piece[] = [
  { radius: 0, length: 700, speed: 320 },                 // S: pit straight
  { radius: 40, sweepDeg: 160, speed: 80 },               // hairpin
  { radius: 0, length: 500, speed: 300 },
  { radius: 400, sweepDeg: 50, speed: 300 },              // wide sweeper: 1.8 g, flat
  { radius: 0, length: 600, speed: 310 },
  { radius: 140, sweepDeg: 70, speed: 290, sign: -1 },    // tight radius taken flat (Eau Rouge-like)
  { radius: 0, length: 600, speed: 320 },
  { radius: 90, sweepDeg: 90, speed: 150 },               // braked corner
  { radius: 0, length: 60, speed: 160 },                  // chicane bridge
  { radius: 90, sweepDeg: 90, speed: 150, sign: -1 },
  { radius: 0, length: 800, speed: 320 },
];

const DT = 0.27;   // ~3.7 Hz, like OpenF1

function synthLap(speedScale = 1, phase = 0): SegmentTrace["data"] {
  const data: SegmentTrace["data"] = [];
  let x = 0, y = 0, heading = 0, dist = 0, t = phase;
  // Speed targets per piece, interpolated across each piece's length.
  const pieceLen = (p: Piece) => p.radius ? (p.sweepDeg! * Math.PI / 180) * p.radius : p.length!;
  const total = LAYOUT.reduce((a, p) => a + pieceLen(p), 0);
  let pieceIdx = 0, intoPiece = 0;
  const t0 = Date.UTC(2026, 0, 1);
  while (dist < total) {
    const p = LAYOUT[pieceIdx];
    const len = pieceLen(p);
    const next = LAYOUT[(pieceIdx + 1) % LAYOUT.length];
    // Ramp toward the next piece's speed over the last 150 m of this one.
    const ramp = Math.max(0, Math.min(1, (intoPiece - (len - 150)) / 150));
    const v = (p.speed + ramp * (next.speed - p.speed)) * speedScale;
    const step = v / 3.6 * DT;
    data.push({
      date: new Date(t0 + t * 1000).toISOString(),
      distance: dist,
      speed: v,
      throttle: v >= p.speed * speedScale - 1 ? 100 : 20,
      brake: next.speed < p.speed && ramp > 0 ? 60 : 0,
      rpm: 10000 + v * 5,
      x: Math.round(x * 10),
      y: Math.round(y * 10),
    });
    if (p.radius) {
      const sign = p.sign ?? 1;
      heading += sign * step / p.radius;
    }
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
    dist += step;
    intoPiece += step;
    t += DT;
    if (intoPiece >= len) { intoPiece -= len; pieceIdx++; if (pieceIdx >= LAYOUT.length) break; }
  }
  return data;
}

function trace(label: string, speedScale: number): SegmentTrace {
  const data = synthLap(speedScale);
  const duration = (new Date(data[data.length - 1].date).getTime() - new Date(data[0].date).getTime()) / 1000 + DT;
  return { data, color: "888888", label, lap: { dateStart: data[0].date, duration } };
}

describe("lap segmentation", () => {
  const cmp = compareLapSegments([trace("A", 1), trace("B", 0.985), trace("C", 0.99)])!;

  it("splits from geometry and sections tile the lap", () => {
    expect(cmp).not.toBeNull();
    expect(cmp.fromGeometry).toBe(true);
    for (let i = 1; i < cmp.segments.length; i++) {
      expect(cmp.segments[i].startIdx).toBe(cmp.segments[i - 1].endIdx);
    }
    for (const t of cmp.totals) {
      expect(Math.abs(t.cornerDelta + t.curveDelta + t.straightDelta - t.totalDelta)).toBeLessThan(1e-9);
    }
  });

  it("calls the wide sweeper and the flat tight bend curves, the braked ones corners", () => {
    const kindsAt = (m: number) => cmp.segments.find(s => s.startDist <= m && m < s.endDist)!.kind;
    expect(kindsAt(750)).toBe("corner");               // hairpin
    expect(kindsAt(1320 + 150)).toBe("curve");         // sweeper (starts ~1312 m)
    expect(kindsAt(2270 + 80)).toBe("curve");          // flat tight bend (starts ~2261 m)
    expect(kindsAt(3030 + 60)).toBe("corner");         // chicane
    expect(cmp.curveCount).toBe(2);
    expect(cmp.cornerCount).toBe(2);
  });

  it("rejoins the chicane into one section counting two turns", () => {
    const chicane = cmp.segments.find(s => s.kind === "corner" && s.startDist > 2800)!;
    expect(chicane.name).toMatch(/^T\d+–\d+$/);
    expect(chicane.length).toBeGreaterThan(300);
  });

  it("has no curve shorter than a section", () => {
    for (const s of cmp.segments) if (s.kind === "curve") expect(s.length).toBeGreaterThanOrEqual(80);
  });

  it("keeps a trace's timing when its car_data feed freezes, and blanks its speeds there", () => {
    const frozen = trace("F", 0.99);
    const from = Math.floor(frozen.data.length * 0.7);
    for (let i = from; i < frozen.data.length; i++) {
      frozen.data[i] = { ...frozen.data[i], speed: 189, rpm: 11535, throttle: 104, brake: 104 };
    }
    const c = compareLapSegments([trace("A", 1), trace("B", 0.985), frozen])!;
    const healthy = cmp.segments.map(s => s.kind);
    expect(c.segments.map(s => s.kind)).toEqual(healthy);
    const last = c.segments[c.segments.length - 1];
    const f = last.timings.find(t => t.label === "F")!;
    expect(Number.isNaN(f.minSpeed)).toBe(true);
    expect(f.time).toBeGreaterThan(0);
    const first = c.segments[0].timings.find(t => t.label === "F")!;
    expect(Number.isFinite(first.minSpeed)).toBe(true);
  });
});

describe("frozenCarDataMask", () => {
  it("flags sentinel rows and the identical-speed run leading into them, not terminal velocity", () => {
    const s = (speed: number, rpm: number, throttle = 100, brake = 0) => ({ speed, rpm, throttle, brake });
    const samples = [
      s(300, 11000), s(305, 11100), s(310, 11200), s(310, 11200), s(310, 11200),   // genuine plateau
      s(312, 11250), s(189, 11535, 80), s(189, 11535, 80), s(189, 11535, 104, 104), s(189, 11535, 104, 104),
      s(250, 10000),
    ];
    expect(frozenCarDataMask(samples)).toEqual([
      false, false, false, false, false,
      false, true, true, true, true,
      false,
    ]);
  });
});
