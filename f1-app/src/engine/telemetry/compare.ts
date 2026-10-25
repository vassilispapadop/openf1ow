// Comparing laps by distance: the same telemetry resampled onto a shared
// distance grid so two laps driven at different speeds line up, and the
// time delta of each lap to the fastest at every point round the circuit.
// Pure functions; the driver page's comparison panel and the share card use
// them.

export interface TelemetrySample {
  date: string;
  distance?: number;
  speed?: number;
  throttle?: number;
  brake?: number;
  n_gear?: number;
  rpm?: number;
  drs?: number;
  x?: number;
  y?: number;
}

export interface LapTrace {
  key: string;
  label: string;
  color: string;             // hex, no leading '#'
  data: TelemetrySample[];   // time-ordered, distance monotone
  lap?: { dateStart: string; duration: number };
}

/** The samples of one lap, cut exactly at the line.
 *
 *  A lap's telemetry is fetched from its start time to a couple of seconds past
 *  its end, so the first sample lands a fraction of a sample interval *after*
 *  the line (the lead differs from lap to lap) and the tail runs on into the
 *  next lap — an in-lap lift, a pit entry. Aligning laps by raw distance from
 *  the first sample puts each lap's zero at a different spot on the track, and
 *  the lead alone reads as a phantom ~0.1–0.2 s between two cars that were level.
 *  Boundary samples are interpolated (extrapolated for the line crossing
 *  before the first sample) so the first one sits exactly at `dateStart` and
 *  the last exactly `duration` later; numeric channels are interpolated, the
 *  step-like ones (throttle, brake, gear, DRS, rpm) take the sample before.
 *  Data that doesn't actually cover the lap is returned untouched. */
export function clipToLap(data: TelemetrySample[], lap: { dateStart: string; duration: number }): TelemetrySample[] {
  const t0 = new Date(lap.dateStart).getTime();
  const t1 = t0 + lap.duration * 1000;
  if (data.length < 2 || !(lap.duration > 0) || !Number.isFinite(t0)) return data;
  const times = data.map(d => new Date(d.date).getTime());
  if (times[0] - t0 > 1000 || times[times.length - 1] < t1 - 1000) return data;

  const at = (t: number): TelemetrySample => {
    let i = 0;
    while (i < times.length - 2 && times[i + 1] <= t) i++;
    const a = data[i], b = data[i + 1];
    const f = (t - times[i]) / (times[i + 1] - times[i] || 1);
    const lerp = (u?: number, v?: number) => (u != null && v != null ? u + f * (v - u) : u);
    return {
      ...a,
      date: new Date(t).toISOString(),
      distance: lerp(a.distance, b.distance),
      speed: lerp(a.speed, b.speed),
      x: lerp(a.x, b.x),
      y: lerp(a.y, b.y),
    };
  };
  const inner = data.filter((_, i) => times[i] > t0 && times[i] < t1);
  return [at(t0), ...inner, at(t1)];
}

/** Put laps on a common axis: each clipped to its own lap (see clipToLap),
 *  distance measured from the line, and stretched so every lap spans the same
 *  length — the mean — which cancels the small scale error in each lap's
 *  integrated distance and makes the final delta exactly the lap-time gap.
 *  Traces without lap timing pass through unchanged. */
export function anchorToLap<T extends LapTrace>(traces: T[]): T[] {
  const clipped = traces.map(t => (t.lap ? clipToLap(t.data, t.lap) : t.data));
  const spans = clipped.map((d, i) => (traces[i].lap && d !== traces[i].data
    ? (d[d.length - 1].distance ?? 0) - (d[0].distance ?? 0)
    : 0));
  const live = spans.filter(s => s > 0);
  if (!live.length) return traces;
  const mean = live.reduce((a, b) => a + b, 0) / live.length;
  return traces.map((t, i) => {
    if (!(spans[i] > 0)) return t;
    const d0 = clipped[i][0].distance ?? 0, k = mean / spans[i];
    return { ...t, data: clipped[i].map(s => ({ ...s, distance: ((s.distance ?? 0) - d0) * k })) };
  });
}

/** Cumulative elapsed seconds against distance for one trace. */
export function elapsedByDistance(data: TelemetrySample[]): { dist: number; elapsed: number }[] {
  if (!data.length) return [];
  const t0 = new Date(data[0].date).getTime();
  return data.map(p => ({ dist: p.distance ?? 0, elapsed: (new Date(p.date).getTime() - t0) / 1000 }));
}

/** Linear interpolation of elapsed time at a distance (clamped at the ends). */
export function elapsedAt(pts: { dist: number; elapsed: number }[], d: number): number {
  if (d <= pts[0].dist) return pts[0].elapsed;
  if (d >= pts[pts.length - 1].dist) return pts[pts.length - 1].elapsed;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].dist <= d) lo = mid; else hi = mid; }
  const span = pts[hi].dist - pts[lo].dist || 1;
  return pts[lo].elapsed + ((d - pts[lo].dist) / span) * (pts[hi].elapsed - pts[lo].elapsed);
}

export interface DeltaToFastest {
  grid: number[];                                   // distances
  perTrace: { key: string; values: number[] }[];    // seconds behind the fastest at each grid point (≥ 0)
  maxDist: number;
}

/** Time behind the fastest lap at each of `n` points round the lap. The
 *  fastest is taken point by point, so every trace is ≥ 0 and at least one
 *  is 0 at every distance. Traces without samples are skipped. `smooth` is a
 *  centred moving-average window in grid points (car data arrives at ~3.7 Hz,
 *  so a point-by-point difference carries sampling jitter of a few tenths). */
export function deltaToFastest(traces: LapTrace[], n = 400, smooth = 5): DeltaToFastest | null {
  const usable = traces.filter(t => t.data.length >= 2);
  if (usable.length < 2) return null;
  const series = usable.map(t => elapsedByDistance(t.data));
  const maxDist = Math.max(...series.map(s => s[s.length - 1].dist));
  if (!(maxDist > 0)) return null;
  const grid = Array.from({ length: n }, (_, i) => (i / (n - 1)) * maxDist);
  const raw = series.map(s => grid.map(d => elapsedAt(s, d)));
  const elapsed = smooth > 1 ? raw.map(e => movingAverage(e, smooth)) : raw;
  const fastest = grid.map((_, i) => Math.min(...elapsed.map(e => e[i])));
  return {
    grid, maxDist,
    perTrace: usable.map((t, ti) => ({ key: t.key, values: grid.map((_, i) => elapsed[ti][i] - fastest[i]) })),
  };
}

/** Contiguous distance spans where a predicate holds — DRS open, brake on. */
export function spansWhere(data: TelemetrySample[], pred: (s: TelemetrySample) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  for (const s of data) {
    const d = s.distance ?? 0;
    if (pred(s)) {
      if (cur) cur.to = d; else cur = { from: d, to: d };
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Centred moving average with a shrinking window at the ends. */
export function movingAverage(xs: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return xs.map((_, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(xs.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += xs[j];
    return s / (hi - lo + 1);
  });
}
