// Corner / straight segmentation for lap-vs-lap comparison.
//
// The delta chart tells you *that* one lap pulled away at ~1,800 m; it doesn't
// tell you whether that was a corner or a straight. This module splits the lap
// into alternating corner and straight sections — derived from the telemetry
// itself, not a hand-maintained circuit database — and times every trace
// through each of them, so the lap-time difference can be attributed to
// cornering vs. straight-line running.
//
// Method:
//   1. Put every trace on a shared lap-fraction axis. Two laps fetched
//      separately don't start at quite the same point on the track, and
//      mergeDistance's polyline integration under-measures by a slightly
//      different amount each lap. Anchoring on each lap's own start time and
//      duration cancels both, and makes the section times add up to the lap
//      time exactly — without it, a phantom tenth of start-line offset lands
//      in whichever section happens to come first.
//   2. Resample each trace onto that axis (interpolating elapsed time, speed,
//      throttle and brake) so the traces are comparable point-for-point.
//   3. Build one shared reference profile — corner boundaries have to fall at
//      identical track positions for every trace or the times aren't
//      comparable.
//   4. Find apexes as local minima in that profile, then expand each out to
//      the braking point behind it and the back-on-power point ahead of it:
//      the phase where a driver can actually gain or lose.
//   5. Merge apexes that sit close together (chicanes, esses) into one section
//      and call everything left over a straight.

interface Sample {
  date: string;
  distance?: number;
  speed?: number;
  throttle?: number;
  brake?: number;
  x?: number;
  y?: number;
}

export interface SegmentTrace {
  data: Sample[];
  color: string;   // hex, no leading #
  label: string;
  /** The lap this telemetry covers. Optional, but supplying it is what pins
   *  the window to exactly one lap; without it we close the lap geometrically,
   *  which is only good to about one sample (~0.27 s). */
  lap?: { dateStart: string; duration: number };
}

export interface SegmentTiming {
  label: string;
  color: string;
  time: number;        // seconds through the section
  delta: number;       // seconds vs. the baseline trace (0 for the baseline)
  minSpeed: number;    // km/h
  maxSpeed: number;    // km/h
  fastest: boolean;    // quickest through this section
}

export interface TrackSegment {
  kind: "corner" | "straight";
  name: string;        // "T3", "T6–T7", "S2"
  startDist: number;   // metres from the line
  endDist: number;
  length: number;
  timings: SegmentTiming[];   // same order as the input traces
}

export interface SegmentTotals {
  label: string;
  color: string;
  isBaseline: boolean;
  cornerTime: number;
  straightTime: number;
  cornerDelta: number;
  straightDelta: number;
  totalDelta: number;
  cornersWon: number;
  straightsWon: number;
}

export interface SegmentComparison {
  segments: TrackSegment[];
  totals: SegmentTotals[];
  baselineLabel: string;
  cornerCount: number;
  straightCount: number;
  cornerDistance: number;
  straightDistance: number;
  trackDistance: number;
}

// ---------------------------------------------------------------------------
// Tuning. Distances are metres, speeds km/h.
// ---------------------------------------------------------------------------

const GRID_POINTS = 600;
/** Half-width of the "is this a local minimum?" window. */
const APEX_WINDOW_M = 70;
/** How far back/forward to look for the peak either side of an apex. */
const PEAK_LOOKAROUND_M = 600;
/** Minimum speed drop from the preceding peak for an apex to count. */
const MIN_SPEED_DROP = 25;
/** Fallback boundary for corners taken without braking (and without a clean
 *  throttle pickup): the lower half of the peak→apex speed drop. */
const ZONE_FRAC = 0.5;
/** Throttle % that counts as "back on power" — the corner-exit boundary. */
const FULL_THROTTLE = 95;
/** Brake % that counts as "on the brakes" — the corner-entry boundary. */
const BRAKING = 5;
/** Corner zones closer than this are one section (chicanes, esses). */
const MERGE_GAP_M = 130;
/** Gaps shorter than this aren't a straight — absorb them into the corner. */
const MIN_STRAIGHT_M = 70;

interface Point {
  dist: number;
  elapsed: number;   // seconds from the trace's own first sample
  speed: number;
  throttle: number;
  brake: number;
}

interface Prepared {
  trace: SegmentTrace;
  pts: Point[];
  startDist: number;   // distance on this trace's axis where the lap begins
  endDist: number;     // ...and where it ends
  lapTime: number;     // seconds between those two points
}

interface Resampled {
  elapsed: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
}

/** Where a lap closes on itself: the point past the 70% mark that comes back
 *  closest to where the trace started. Used only when the caller didn't tell
 *  us the lap's duration. Null if the location data never gets back near the
 *  start — then we can't see the lap close and shouldn't guess. */
function geometricLapEnd(data: Sample[]): number | null {
  const x0 = data[0].x, y0 = data[0].y;
  if (x0 == null || y0 == null || (x0 === 0 && y0 === 0)) return null;
  const from = Math.floor(data.length * 0.7);
  let bestD2 = Infinity, bestDist: number | null = null;
  for (let i = from; i < data.length; i++) {
    const x = data[i].x, y = data[i].y;
    if (x == null || y == null) continue;
    const d2 = (x - x0) ** 2 + (y - y0) ** 2;
    if (d2 < bestD2) { bestD2 = d2; bestDist = data[i].distance ?? 0; }
  }
  return bestD2 > 300 ** 2 ? null : bestDist;
}

/** Distance at a given elapsed time, extrapolating linearly off either end
 *  (the caller only ever asks for a fraction of a sample past them). */
function distAtElapsed(pts: Point[], t: number): number {
  if (t <= pts[0].elapsed) {
    const a = pts[0], b = pts[1];
    const dt = b.elapsed - a.elapsed;
    return dt > 0 ? a.dist + ((t - a.elapsed) / dt) * (b.dist - a.dist) : a.dist;
  }
  const last = pts[pts.length - 1];
  if (t >= last.elapsed) {
    const a = pts[pts.length - 2], b = last;
    const dt = b.elapsed - a.elapsed;
    return dt > 0 ? b.dist + ((t - b.elapsed) / dt) * (b.dist - a.dist) : b.dist;
  }
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].elapsed <= t) lo = mid; else hi = mid;
  }
  const frac = (t - pts[lo].elapsed) / (pts[hi].elapsed - pts[lo].elapsed || 1);
  return pts[lo].dist + frac * (pts[hi].dist - pts[lo].dist);
}

function elapsedAtDist(pts: Point[], d: number): number {
  if (d <= pts[0].dist) return pts[0].elapsed;
  const last = pts[pts.length - 1];
  if (d >= last.dist) return last.elapsed;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].dist <= d) lo = mid; else hi = mid;
  }
  const frac = (d - pts[lo].dist) / (pts[hi].dist - pts[lo].dist || 1);
  return pts[lo].elapsed + frac * (pts[hi].elapsed - pts[lo].elapsed);
}

function prepare(trace: SegmentTrace): Prepared | null {
  const data = trace.data;
  if (data.length < 20) return null;

  const t0 = new Date(data[0].date).getTime();
  const pts: Point[] = [];
  for (const p of data) {
    const dist = p.distance ?? 0;
    // mergeDistance snaps several car_data samples onto the same location
    // point, so distance repeats; keep the first of each run to leave the
    // distance axis strictly increasing.
    if (pts.length && dist <= pts[pts.length - 1].dist) continue;
    pts.push({
      dist,
      elapsed: (new Date(p.date).getTime() - t0) / 1000,
      speed: p.speed ?? 0,
      throttle: p.throttle ?? 0,
      brake: p.brake ?? 0,
    });
  }
  if (pts.length < 10) return null;

  if (trace.lap?.dateStart && trace.lap.duration > 0) {
    // car_data is queried with date >= the lap's start, so the first sample
    // lands a fraction of a sample interval *after* the line. Measure the
    // window from the line itself.
    const lead = (t0 - new Date(trace.lap.dateStart).getTime()) / 1000;
    const startDist = distAtElapsed(pts, -lead);
    const endDist = distAtElapsed(pts, trace.lap.duration - lead);
    // distAtElapsed extrapolates past the last sample, which is fine for the
    // fraction of a sample we're normally short but nonsense if the telemetry
    // stops mid-lap. Only trust it when the samples actually cover the lap.
    const covered = pts[pts.length - 1].elapsed + lead >= trace.lap.duration - 1;
    if (covered && endDist - startDist > 500) {
      return { trace, pts, startDist, endDist, lapTime: trace.lap.duration };
    }
  }

  const geoEnd = geometricLapEnd(data);
  const endDist = geoEnd != null && geoEnd - pts[0].dist > 500 ? geoEnd : pts[pts.length - 1].dist;
  if (endDist - pts[0].dist < 500) return null;
  return {
    trace,
    pts,
    startDist: pts[0].dist,
    endDist,
    lapTime: elapsedAtDist(pts, endDist) - pts[0].elapsed,
  };
}

/** Resample a prepared trace onto a lap-fraction grid (0 = the line, 1 = the
 *  line again). Elapsed times come back relative to the lap start. */
function resample(p: Prepared, fractions: number[]): Resampled {
  const span = p.endDist - p.startDist;
  const base = elapsedAtDist(p.pts, p.startDist);
  const elapsed: number[] = [];
  const speed: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  for (const u of fractions) {
    const d = p.startDist + u * span;
    let lo: number, frac: number;
    if (d <= p.pts[0].dist) {
      lo = 0; frac = 0;
    } else if (d >= p.pts[p.pts.length - 1].dist) {
      lo = p.pts.length - 1; frac = 0;
    } else {
      lo = 0;
      let hi = p.pts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (p.pts[mid].dist <= d) lo = mid; else hi = mid;
      }
      frac = (d - p.pts[lo].dist) / (p.pts[hi].dist - p.pts[lo].dist || 1);
    }
    const a = p.pts[lo], b = p.pts[Math.min(lo + 1, p.pts.length - 1)];
    elapsed.push(a.elapsed + frac * (b.elapsed - a.elapsed) - base);
    speed.push(a.speed + frac * (b.speed - a.speed));
    // Throttle and brake only drive boundary detection, where a step reads
    // truer than a ramp — take the sample we're sitting on.
    throttle.push(a.throttle);
    brake.push(a.brake);
  }
  // The axis is anchored on the lap's own duration, so pin the final elapsed
  // value rather than letting interpolation drift off it.
  elapsed[elapsed.length - 1] = p.lapTime;
  return { elapsed, speed, throttle, brake };
}

/** Corner zones as [startIdx, endIdx] index pairs on the grid, plus how many
 *  apexes each zone swallowed (a chicane is one zone but two turns).
 *
 *  `brake` is the hardest braking across the traces and `throttle` the most
 *  conservative, so a zone runs from the earliest braking point to the point
 *  every lap is back at full throttle — the window where the laps can differ.
 *  Whoever gets back on power first banks their time inside it. */
function findCornerZones(
  profile: number[],
  brake: number[],
  throttle: number[],
  step: number,
): { start: number; end: number; apexes: number }[] {
  const win = Math.max(3, Math.round(APEX_WINDOW_M / step));
  const look = Math.max(win, Math.round(PEAK_LOOKAROUND_M / step));
  const n = profile.length;

  const apexIdx: number[] = [];
  for (let i = win; i < n - win; i++) {
    const s = profile[i];
    let isMin = true;
    for (let j = i - win; j <= i + win; j++) {
      if (j !== i && profile[j] < s - 0.001) { isMin = false; break; }
    }
    if (!isMin) continue;
    if (apexIdx.length && i - apexIdx[apexIdx.length - 1] < win) continue;
    let peakBefore = s;
    for (let j = Math.max(0, i - look); j < i; j++) if (profile[j] > peakBefore) peakBefore = profile[j];
    if (peakBefore - s < MIN_SPEED_DROP) continue;
    apexIdx.push(i);
  }
  if (!apexIdx.length) return [];

  const zones = apexIdx.map(i => {
    const s = profile[i];
    let peakBefore = s;
    for (let j = Math.max(0, i - look); j < i; j++) if (profile[j] > peakBefore) peakBefore = profile[j];
    let peakAfter = s;
    for (let j = i + 1; j <= Math.min(n - 1, i + look); j++) if (profile[j] > peakAfter) peakAfter = profile[j];

    // Entry: back up through the braking run that leads into this apex.
    let start: number | null = null;
    for (let j = i; j >= Math.max(0, i - look); j--) {
      if (brake[j] >= BRAKING) start = j;
      else if (start != null) break;
    }
    if (start == null) {
      // Flat-out corner — fall back to the speed profile.
      const entryLevel = s + ZONE_FRAC * (peakBefore - s);
      start = i;
      while (start > 0 && profile[start - 1] <= entryLevel) start--;
    }

    // Exit: forward to the first sample that's back at full throttle.
    let end: number | null = null;
    for (let j = i; j <= Math.min(n - 1, i + look); j++) {
      if (throttle[j] >= FULL_THROTTLE) { end = j; break; }
    }
    if (end == null) {
      const exitLevel = s + ZONE_FRAC * (peakAfter - s);
      end = i;
      while (end < n - 1 && profile[end + 1] <= exitLevel) end++;
    }

    return { start, end: Math.max(end, i), apexes: 1 };
  });

  // Merge overlapping / near-touching zones.
  const gap = Math.max(1, Math.round(MERGE_GAP_M / step));
  const merged: typeof zones = [];
  for (const z of zones) {
    const prev = merged[merged.length - 1];
    if (prev && z.start - prev.end <= gap) {
      prev.end = Math.max(prev.end, z.end);
      prev.apexes += z.apexes;
    } else {
      merged.push({ ...z });
    }
  }
  return merged;
}

export function compareLapSegments(traces: SegmentTrace[]): SegmentComparison | null {
  const prepared = traces.map(prepare).filter((p): p is Prepared => p != null);
  if (prepared.length < 2) return null;

  // Lap length varies a little between traces because mergeDistance integrates
  // a polyline through ~3.7 Hz location fixes; the mean is the honest number
  // to put on the axis.
  const lapLength = prepared.reduce((a, p) => a + (p.endDist - p.startDist), 0) / prepared.length;
  const step = lapLength / (GRID_POINTS - 1);
  const fractions = Array.from({ length: GRID_POINTS }, (_, i) => i / (GRID_POINTS - 1));
  const sampled = prepared.map(p => ({ trace: p.trace, r: resample(p, fractions) }));

  // One shared set of profiles so every trace is cut at the same track
  // positions: mean speed, hardest braking, most conservative throttle.
  const profile = fractions.map((_, i) =>
    sampled.reduce((sum, s) => sum + s.r.speed[i], 0) / sampled.length);
  const brakeMax = fractions.map((_, i) => Math.max(...sampled.map(s => s.r.brake[i])));
  const throttleMin = fractions.map((_, i) => Math.min(...sampled.map(s => s.r.throttle[i])));

  const zones = findCornerZones(profile, brakeMax, throttleMin, step);
  if (!zones.length) return null;

  // Interleave corners with the straights between them.
  type Raw = { kind: "corner" | "straight"; start: number; end: number; apexes: number };
  const raw: Raw[] = [];
  let cursor = 0;
  const minStraight = Math.max(1, Math.round(MIN_STRAIGHT_M / step));
  for (const z of zones) {
    if (z.start - cursor >= minStraight) {
      raw.push({ kind: "straight", start: cursor, end: z.start, apexes: 0 });
      raw.push({ kind: "corner", start: z.start, end: z.end, apexes: z.apexes });
    } else {
      // Too short to be a straight — hand it to the corner.
      raw.push({ kind: "corner", start: cursor, end: z.end, apexes: z.apexes });
    }
    cursor = z.end;
  }
  const lastIdx = GRID_POINTS - 1;
  if (lastIdx - cursor >= minStraight) {
    raw.push({ kind: "straight", start: cursor, end: lastIdx, apexes: 0 });
  } else if (raw.length) {
    raw[raw.length - 1].end = lastIdx;
  }
  if (raw.length < 2) return null;

  // Baseline = the quickest lap; everything else reads as ± against it.
  const lapTimes = prepared.map(p => p.lapTime);
  const baselineIdx = lapTimes.indexOf(Math.min(...lapTimes));

  let turnNo = 0;
  let straightNo = 0;
  const segments: TrackSegment[] = raw.map(r => {
    let name: string;
    if (r.kind === "corner") {
      const first = turnNo + 1;
      turnNo += Math.max(1, r.apexes);
      name = first === turnNo ? "T" + first : "T" + first + "–" + turnNo;
    } else {
      name = "S" + ++straightNo;
    }

    const times = sampled.map(s => s.r.elapsed[r.end] - s.r.elapsed[r.start]);
    const best = Math.min(...times);
    const baseTime = times[baselineIdx];

    const timings: SegmentTiming[] = sampled.map((s, i) => {
      let minSpeed = Infinity, maxSpeed = -Infinity;
      for (let j = r.start; j <= r.end; j++) {
        const v = s.r.speed[j];
        if (v < minSpeed) minSpeed = v;
        if (v > maxSpeed) maxSpeed = v;
      }
      return {
        label: s.trace.label,
        color: s.trace.color,
        time: times[i],
        delta: times[i] - baseTime,
        minSpeed,
        maxSpeed,
        fastest: times[i] <= best + 1e-9,
      };
    });

    return {
      kind: r.kind,
      name,
      startDist: fractions[r.start] * lapLength,
      endDist: fractions[r.end] * lapLength,
      length: (fractions[r.end] - fractions[r.start]) * lapLength,
      timings,
    };
  });

  const totals: SegmentTotals[] = sampled.map((s, i) => {
    let cornerTime = 0, straightTime = 0, cornerDelta = 0, straightDelta = 0;
    let cornersWon = 0, straightsWon = 0;
    for (const seg of segments) {
      const t = seg.timings[i];
      if (seg.kind === "corner") {
        cornerTime += t.time;
        cornerDelta += t.delta;
        if (t.fastest) cornersWon++;
      } else {
        straightTime += t.time;
        straightDelta += t.delta;
        if (t.fastest) straightsWon++;
      }
    }
    return {
      label: s.trace.label,
      color: s.trace.color,
      isBaseline: i === baselineIdx,
      cornerTime,
      straightTime,
      cornerDelta,
      straightDelta,
      totalDelta: cornerDelta + straightDelta,
      cornersWon,
      straightsWon,
    };
  });

  const cornerSegs = segments.filter(s => s.kind === "corner");
  const straightSegs = segments.filter(s => s.kind === "straight");

  return {
    segments,
    totals,
    baselineLabel: sampled[baselineIdx].trace.label,
    cornerCount: cornerSegs.length,
    straightCount: straightSegs.length,
    cornerDistance: cornerSegs.reduce((a, s) => a + s.length, 0),
    straightDistance: straightSegs.reduce((a, s) => a + s.length, 0),
    trackDistance: lapLength,
  };
}
