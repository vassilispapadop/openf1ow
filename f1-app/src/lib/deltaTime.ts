// Delta-time analysis: the pit-wall tool for driver coaching. Given two laps'
// telemetry (car_data + location merged into distance-stamped samples), we build
// a common distance axis and compute the CUMULATIVE time delta between the two
// drivers down the lap — the classic "delta-T" trace that localises exactly
// where a lap was won or lost.
//
// Sampling caveat: OpenF1 car_data is ~4 Hz and distance is integrated from GPS
// location, so the *shape* of the trace (where time moves) is trustworthy while
// the absolute endpoint carries a little GPS-integration error. Callers should
// headline the true lap_duration gap and use this trace for the "where".

export interface TeleSample {
  d: number;        // cumulative track distance from lap start (m)
  t: number;        // seconds since lap start
  speed: number;    // km/h
  throttle: number; // 0-100
  brake: number;    // 0-100 (usually 0 or 100)
  gear: number;     // 0-8
}

/** Turn merged car_data+location samples into a monotonic-distance lap series. */
export function buildLapSeries(merged: any[], lapStartIso: string): TeleSample[] {
  const t0 = new Date(lapStartIso).getTime();
  const out: TeleSample[] = [];
  let lastD = -Infinity;
  for (const s of merged) {
    const d = typeof s.distance === "number" ? s.distance : NaN;
    const t = (new Date(s.date).getTime() - t0) / 1000;
    if (!isFinite(d) || !isFinite(t) || t < -1) continue;
    // Distance must be non-decreasing for safe interpolation. Nearest-location
    // assignment is monotonic in time, so genuine decreases are GPS noise.
    if (d < lastD) continue;
    lastD = d;
    out.push({
      d,
      t,
      speed: s.speed ?? 0,
      throttle: s.throttle ?? 0,
      brake: s.brake ?? 0,
      gear: s.n_gear ?? 0,
    });
  }
  return out;
}

type NumKey = "t" | "speed";

/** Linear-interpolate a channel at an arbitrary distance along the lap. */
function interp(series: TeleSample[], d: number, key: NumKey): number {
  const n = series.length;
  if (d <= series[0].d) return series[0][key];
  if (d >= series[n - 1].d) return series[n - 1][key];
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].d < d) lo = mid + 1; else hi = mid;
  }
  const b = series[lo], a = series[lo - 1];
  const span = b.d - a.d;
  const f = span > 0 ? (d - a.d) / span : 0;
  return a[key] + (b[key] - a[key]) * f;
}

export interface Comparison {
  grid: number[];    // distances (m), 0..maxD
  deltaT: number[];  // tB - tA at each distance (s); >0 = B slower here
  speedA: number[];  // km/h
  speedB: number[];
  maxD: number;
  finalDelta: number; // integrated gap at lap end (s)
}

/** Resample both laps onto a shared distance grid and compute the delta trace.
 *  Convention: deltaT = tB - tA, so a rising trace means B is losing time to A. */
export function compareLaps(a: TeleSample[], b: TeleSample[], n = 240): Comparison | null {
  if (a.length < 10 || b.length < 10) return null;
  const maxD = Math.min(a[a.length - 1].d, b[b.length - 1].d);
  if (!(maxD > 0)) return null;
  const grid: number[] = [], deltaT: number[] = [], speedA: number[] = [], speedB: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = (maxD * i) / n;
    const ta = interp(a, d, "t"), tb = interp(b, d, "t");
    grid.push(d);
    deltaT.push(tb - ta);
    speedA.push(interp(a, d, "speed"));
    speedB.push(interp(b, d, "speed"));
  }
  return { grid, deltaT, speedA, speedB, maxD, finalDelta: deltaT[deltaT.length - 1] };
}

export interface DrivingMetrics {
  fullThrottlePct: number; // % of lap at >=90% throttle
  brakePct: number;        // % of lap on the brakes
  coastPct: number;        // % of lap coasting (neither pedal) — pure lost time
  topSpeed: number;        // km/h
  samples: number;
}

/** Driving-style fingerprint from a lap's telemetry. Sample-count weighted,
 *  which at a steady ~4 Hz is a fair proxy for time-weighted. */
export function drivingMetrics(series: TeleSample[]): DrivingMetrics {
  let ft = 0, br = 0, coast = 0, top = 0;
  for (const s of series) {
    if (s.throttle >= 90) ft++;
    const braking = s.brake > 0;
    if (braking) br++;
    if (s.throttle < 5 && !braking) coast++;
    if (s.speed > top) top = s.speed;
  }
  const n = series.length || 1;
  return {
    fullThrottlePct: (ft / n) * 100,
    brakePct: (br / n) * 100,
    coastPct: (coast / n) * 100,
    topSpeed: top,
    samples: series.length,
  };
}

export interface MiniSector {
  index: number;
  dStart: number;
  dEnd: number;
  delta: number; // time B gained (<0) or lost (>0) across this sector (s)
}

/** Split the delta trace into equal-distance mini-sectors and report how much
 *  time B gained or lost in each — the "where the lap was made" breakdown. */
export function miniSectors(cmp: Comparison, sectors = 12): MiniSector[] {
  const out: MiniSector[] = [];
  const n = cmp.grid.length;
  for (let s = 0; s < sectors; s++) {
    const i0 = Math.floor((s * (n - 1)) / sectors);
    const i1 = Math.floor(((s + 1) * (n - 1)) / sectors);
    out.push({
      index: s + 1,
      dStart: cmp.grid[i0],
      dEnd: cmp.grid[i1],
      delta: cmp.deltaT[i1] - cmp.deltaT[i0],
    });
  }
  return out;
}
