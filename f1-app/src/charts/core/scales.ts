// Scale and path helpers shared by every chart primitive. Thin over d3-scale /
// d3-shape / d3-array so the maths is theirs and the rendering is ours.

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { line as d3line, curveStepAfter, curveCatmullRom, curveLinear, curveMonotoneX } from "d3-shape";
import { bisector, extent as d3extent } from "d3-array";

export type Linear = ScaleLinear<number, number>;

export function linear(domain: [number, number], range: [number, number], nice = false): Linear {
  const s = scaleLinear().domain(domain).range(range);
  return nice ? s.nice() : s;
}

/** Round a raw axis step up to a 1/2/5 × 10ⁿ value. */
export function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/** Ticks from `min` to `max` on a nice step, always including zero when the
 *  range spans it (so a signed axis shows the reference line). */
export function ticks(min: number, max: number, target = 5): number[] {
  // A degenerate span (a flat series) gets one tick, not a thousand.
  if (!(max > min) || max - min < 1e-9 * Math.max(1, Math.abs(max))) return [+min.toFixed(6) || 0];
  const step = niceStep((max - min) / target);
  const out: number[] = [];
  for (let g = Math.ceil(min / step - 1e-9) * step; g <= max + step * 1e-4 && out.length < 50; g += step) out.push(+g.toFixed(6) || 0);
  if (min <= 0 && max >= 0 && !out.some(t => Math.abs(t) < 1e-9)) out.push(0);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** [min, max] over numbers, ignoring non-finite values; null when empty. */
export function extent(values: Iterable<number>): [number, number] | null {
  const e = d3extent(Array.from(values).filter(Number.isFinite));
  return e[0] == null || e[1] == null ? null : [e[0], e[1]];
}

/** Pad a domain by a fraction of its span (min 1e-9 span). */
export function pad([lo, hi]: [number, number], frac = 0.08, floor = 0): [number, number] {
  const span = Math.max(hi - lo, floor || 1e-9);
  return [lo - span * frac, hi + span * frac];
}

export type Curve = "linear" | "smooth" | "monotone" | "step";

const CURVES = {
  linear: curveLinear,
  // Low-alpha Catmull-Rom: hugs the data, softens joints, does not invent shape.
  smooth: curveCatmullRom.alpha(0.5),
  monotone: curveMonotoneX,
  // Hold each value until the next sample: gears, brake on/off, DRS state.
  step: curveStepAfter,
};

/** SVG path through screen points (NaN/undefined y breaks the line). */
export function pathFor(points: { x: number; y: number }[], curve: Curve = "linear"): string {
  const gen = d3line<{ x: number; y: number }>()
    .defined(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .x(p => p.x)
    .y(p => p.y)
    .curve(CURVES[curve]);
  return gen(points) ?? "";
}

/** Index of the element whose x is nearest to `x` in a sorted array. */
export function nearestIndex<T>(sorted: readonly T[], x: (t: T) => number, target: number): number {
  if (!sorted.length) return -1;
  const i = bisector<T, number>(x).center(sorted, target);
  return Math.max(0, Math.min(sorted.length - 1, i));
}

/** Circuit name trimmed for an X-axis tick. */
export function shortMeetingName(meetingName: string, maxLen = 10): string {
  const name = meetingName.replace(/\s+(Grand Prix|GP)$/i, "").trim();
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

/** Number formatters used across charts. */
export const fmt = {
  /** Signed seconds with adaptive precision: +0.123 below 1 s, +1.23 above. */
  signedSec: (v: number, dp?: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp ?? (Math.abs(v) < 1 ? 3 : 2)),
  sec: (v: number, dp = 3) => v.toFixed(dp),
  /** M:SS.sss */
  lapTime: (v: number) => {
    const m = Math.floor(v / 60);
    const s = v - m * 60;
    return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
  },
  pct: (v: number, dp = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp) + "%",
  kph: (v: number) => Math.round(v) + " km/h",
  int: (v: number) => String(Math.round(v)),
};
