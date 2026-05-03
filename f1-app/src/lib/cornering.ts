// Per-corner analysis derived from car_data telemetry: speed, throttle,
// brake samples around the lap. We detect corner apexes as local minima
// in the speed trace, then walk outward to find brake-on, brake-off,
// and full-throttle points.
//
// Sampling rate is ~4 Hz on OpenF1's car_data, so a typical 90-second
// lap has ~360 points — fast enough for naïve linear scans.

export interface TelemetrySample {
  date: string;
  speed: number;            // km/h
  throttle: number;         // 0-100
  brake: number;            // 0-100
}

export interface Corner {
  apexIndex: number;
  apexSpeed: number;        // km/h at apex
  apexTime: number;         // seconds since lap start
  brakeOnIndex: number | null;
  brakeOffIndex: number | null;
  brakeDuration: number;    // seconds (0 if no brake found)
  topSpeedBefore: number;   // km/h, the speed peak preceding the corner
  speedDelta: number;       // km/h dropped from peak to apex
  throttleOnIndex: number | null;   // first sample with throttle ≥ 90%
  timeToFullThrottle: number;       // seconds from apex to ≥ 90% throttle (0 if not found)
}

interface Options {
  /** How wide a window (samples) to scan for "is this a true local min?" */
  windowSamples?: number;
  /** Minimum speed drop from preceding peak to count as a corner (km/h). */
  minSpeedDelta?: number;
  /** Threshold (km/h) above which we don't classify as corner — straight. */
  straightSpeed?: number;
  /** Throttle threshold to call "full throttle" (%). */
  fullThrottle?: number;
  /** Brake threshold to call "braking" (%). */
  brakingThreshold?: number;
}

const DEFAULT_OPTS: Required<Options> = {
  windowSamples: 18,         // ~4.5s at 4 Hz — enough to see one full corner
  minSpeedDelta: 50,
  straightSpeed: 280,
  fullThrottle: 90,
  brakingThreshold: 5,
};

export function detectCorners(samples: TelemetrySample[], opts: Options = {}): Corner[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (samples.length < 3 * o.windowSamples) return [];

  const t0 = new Date(samples[0].date).getTime();
  const sec = (i: number) => (new Date(samples[i].date).getTime() - t0) / 1000;

  const corners: Corner[] = [];
  let lastApex = -Infinity;
  for (let i = o.windowSamples; i < samples.length - o.windowSamples; i++) {
    const s = samples[i].speed;
    if (s > o.straightSpeed) continue;
    // Local minimum within ±windowSamples?
    let isMin = true;
    for (let j = i - o.windowSamples; j <= i + o.windowSamples; j++) {
      if (j === i) continue;
      if (samples[j].speed < s - 0.001) { isMin = false; break; }
    }
    if (!isMin) continue;
    // Avoid clustering: require at least windowSamples since last accepted apex
    if (i - lastApex < o.windowSamples) continue;
    // Confirm there's a meaningful speed drop from the preceding peak
    let topBefore = s;
    for (let j = Math.max(0, i - 4 * o.windowSamples); j < i; j++) {
      if (samples[j].speed > topBefore) topBefore = samples[j].speed;
    }
    if (topBefore - s < o.minSpeedDelta) continue;

    // Walk back from apex to find brake-on (first sample with brake ≥ threshold)
    let brakeOnIdx: number | null = null;
    let brakeOffIdx: number | null = null;
    for (let j = i; j >= Math.max(0, i - 3 * o.windowSamples); j--) {
      if (samples[j].brake >= o.brakingThreshold) brakeOnIdx = j;
      else if (brakeOnIdx != null) break;
    }
    if (brakeOnIdx != null) {
      // Walk forward from brake-on to find brake-off (last consecutive sample with brake)
      for (let j = brakeOnIdx; j <= Math.min(samples.length - 1, i + o.windowSamples); j++) {
        if (samples[j].brake >= o.brakingThreshold) brakeOffIdx = j;
        else if (brakeOffIdx != null) break;
      }
    }

    // Walk forward from apex to find first ≥ fullThrottle sample
    let throttleOnIdx: number | null = null;
    for (let j = i; j <= Math.min(samples.length - 1, i + 3 * o.windowSamples); j++) {
      if (samples[j].throttle >= o.fullThrottle) { throttleOnIdx = j; break; }
    }

    corners.push({
      apexIndex: i,
      apexSpeed: s,
      apexTime: sec(i),
      brakeOnIndex: brakeOnIdx,
      brakeOffIndex: brakeOffIdx,
      brakeDuration: brakeOnIdx != null && brakeOffIdx != null
        ? Math.max(0, sec(brakeOffIdx) - sec(brakeOnIdx))
        : 0,
      topSpeedBefore: topBefore,
      speedDelta: topBefore - s,
      throttleOnIndex: throttleOnIdx,
      timeToFullThrottle: throttleOnIdx != null
        ? Math.max(0, sec(throttleOnIdx) - sec(i))
        : 0,
    });
    lastApex = i;
  }
  return corners;
}
