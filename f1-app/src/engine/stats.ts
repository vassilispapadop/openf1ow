// Statistics primitives for the engine. Pure functions, no DOM, no React.
//
// `median` throws on an empty array on purpose: the old `median([]) === 0`
// let empty sets flow into gap arithmetic as real numbers. Callers gate first
// (see types/gated.ts) or use `medianOrNull`.

import type { Fit } from "./types/gated.ts";

export function median(xs: readonly number[]): number {
  if (!xs.length) throw new Error("median of an empty sample");
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function medianOrNull(xs: readonly number[]): number | null {
  return xs.length ? median(xs) : null;
}

export function mean(xs: readonly number[]): number {
  if (!xs.length) throw new Error("mean of an empty sample");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n − 1). Lap times are a sample of an
 *  underlying ability, so this — not the population form — is the one σ. */
export function sampleStd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** Median absolute deviation, scaled to be comparable with σ for normal data. */
export function mad(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map(x => Math.abs(x - m)));
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) throw new Error("quantile of an empty sample");
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Two-sided 97.5 % Student-t critical value — a good closed-form
 *  approximation for df ≥ 3; exact enough for confidence bands on lap data. */
export function tCrit95(df: number): number {
  if (df <= 1) return 12.706;
  if (df === 2) return 4.303;
  if (df === 3) return 3.182;
  if (df === 4) return 2.776;
  if (df === 5) return 2.571;
  // Asymptotic expansion around the normal quantile 1.96.
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}

/** Theil–Sen slope: median of pairwise slopes. Robust to a couple of bad laps. */
export function theilSen(xs: readonly number[], ys: readonly number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j] - xs[i];
      if (dx !== 0) slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  return slopes.length ? median(slopes) : 0;
}

/** Ordinary least squares with diagnostics. Returns null when there are fewer
 *  than 3 points or x has no variance. */
export function olsFit(xs: readonly number[], ys: readonly number[]): Fit | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const xm = mean(xs);
  const ym = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xm;
    const dy = ys[i] - ym;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = ym - slope * xm;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    sse += r * r;
  }
  const df = n - 2;
  const residualStd = df > 0 ? Math.sqrt(sse / df) : 0;
  const se = df > 0 ? residualStd / Math.sqrt(sxx) : 0;
  const t = tCrit95(Math.max(1, df));
  const r2 = syy > 0 ? 1 - sse / syy : 0;
  return {
    slope,
    intercept,
    r2,
    se,
    ci95: [slope - t * se, slope + t * se],
    n,
    residualStd,
    robustSlope: theilSen(xs, ys),
  };
}

/** Deterministic xorshift PRNG so bootstrap results are reproducible in tests. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

/** Percentile bootstrap 95 % CI of the median. */
export function bootstrapMedianCI(xs: readonly number[], resamples = 1000, seed = 42): [number, number] {
  if (xs.length < 2) {
    const v = xs.length ? xs[0] : 0;
    return [v, v];
  }
  const rand = rng(seed);
  const meds = new Array<number>(resamples);
  const sample = new Array<number>(xs.length);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < xs.length; i++) sample[i] = xs[Math.floor(rand() * xs.length)];
    meds[r] = median(sample);
  }
  return [quantile(meds, 0.025), quantile(meds, 0.975)];
}

/** Two-sided exact sign test on paired differences (ties dropped). Returns the
 *  p-value for "the median difference is zero". */
export function pairedSignTest(diffs: readonly number[]): number {
  let pos = 0, neg = 0;
  for (const d of diffs) {
    if (d > 0) pos++;
    else if (d < 0) neg++;
  }
  const n = pos + neg;
  if (n === 0) return 1;
  const k = Math.min(pos, neg);
  // P(X ≤ k) for X ~ Binomial(n, 0.5), doubled and capped.
  let p = 0;
  let c = 1; // C(n, 0)
  for (let i = 0; i <= k; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    p += c;
  }
  p = p / 2 ** n;
  return Math.min(1, 2 * p);
}

/** Two-segment least-squares split. Returns the split index (into the sorted
 *  x order) with the smallest total SSE, requiring at least `minSeg` points a
 *  side, plus the two slopes and the BIC improvement over one line. */
export function twoSegmentFit(
  xs: readonly number[],
  ys: readonly number[],
  minSeg = 4,
): { splitAt: number; before: Fit; after: Fit; deltaBic: number } | null {
  const n = xs.length;
  if (n < minSeg * 2) return null;
  const one = olsFit(xs, ys);
  if (!one) return null;
  let sse1 = 0;
  for (let i = 0; i < n; i++) sse1 += (ys[i] - (one.intercept + one.slope * xs[i])) ** 2;

  let best: { splitAt: number; before: Fit; after: Fit; sse: number } | null = null;
  for (let k = minSeg; k <= n - minSeg; k++) {
    const a = olsFit(xs.slice(0, k), ys.slice(0, k));
    const b = olsFit(xs.slice(k), ys.slice(k));
    if (!a || !b) continue;
    let sse = 0;
    for (let i = 0; i < k; i++) sse += (ys[i] - (a.intercept + a.slope * xs[i])) ** 2;
    for (let i = k; i < n; i++) sse += (ys[i] - (b.intercept + b.slope * xs[i])) ** 2;
    if (!best || sse < best.sse) best = { splitAt: k, before: a, after: b, sse };
  }
  if (!best || best.sse <= 0 || sse1 <= 0) return null;
  // Two extra parameters (second slope + intercept) → penalty 2·ln n.
  const deltaBic = n * Math.log(sse1 / best.sse) - 2 * Math.log(n);
  return { splitAt: best.splitAt, before: best.before, after: best.after, deltaBic };
}

/** Binary search: index of the last element with key ≤ target, or -1. */
export function lastIndexLE<T>(arr: readonly T[], key: (t: T) => number, target: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
