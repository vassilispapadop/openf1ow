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
//   4. Classify each point of the lap from the track's own GEOMETRY: corner
//      where the racing line's radius drops below CORNER_RADIUS_M, straight
//      where it doesn't. Curvature comes from the (x, y) fixes, so it says
//      what the circuit does rather than what a driver did on it — Copse and
//      Maggotts/Becketts are corners whether or not anyone lifted.
//   5. Merge curvature runs that sit close together (chicanes, esses) into one
//      section and call everything left over a straight.
//
// The geometric definition replaced an earlier one that ran each corner from
// its braking point to the point the car was back at full throttle. That read
// naturally but had two failure modes this one doesn't: flat-out corners were
// classified as straights (Silverstone came out 27% corner against a true ~45%),
// and because the brake/throttle envelope was taken across the whole comparison
// set, the same circuit gave a different answer for two cars than for eleven.
// Geometry is a property of the track, so the split is now stable and can be
// checked against a circuit map.
//
// Calibration: a 250 m radius threshold puts (100 - corner%) within 3.8
// percentage points of published full-throttle shares across the 2026 calendar
// — exact at Monza (80%), Spielberg (72%) and Budapest (51%). Circuits with
// fast corners taken flat sit above that line, which is the point.

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
  /** Index range into SegmentComparison.path, so the section can be drawn on
   *  the track map. */
  startIdx: number;
  endIdx: number;
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
  /** The reference racing line, one point per grid step, for drawing the
   *  circuit. Empty when the laps had no usable position fixes. */
  path: { x: number; y: number }[];
  /** False when the sections were read off braking and throttle because no
   *  position fixes were available — the split is then driving-dependent and
   *  misses corners taken flat. */
  fromGeometry: boolean;
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
/** Turn radius at or below which the track counts as cornering. See the
 *  calibration note at the top of the file. */
const CORNER_RADIUS_M = 250;
/** Baseline either side of a point when measuring heading change. Long enough
 *  to ride over position-fix jitter, short enough to resolve a chicane. */
const CURVATURE_WINDOW_M = 20;
/** A corner has to be at least this long — shorter runs are fix noise. */
const MIN_CORNER_M = 25;
/** Corner zones closer than this are one section (chicanes, esses). Tuned
 *  against published full-throttle shares: 60 m gives 3.3 pp mean error across
 *  the 2026 calendar, against 4.0 at 90 m and 4.8 at 130 m — merge harder and
 *  the short straights between chicane elements get eaten by the corners. */
const MERGE_GAP_M = 60;
/** Gaps shorter than this aren't a straight — absorb them into the corner. */
const MIN_STRAIGHT_M = 70;
/** Position fixes are decimetres — mirrors LOC_TO_METERS in lib/telemetry.ts. */
const LOC_TO_METERS = 10;
/** How far either side of the predicted position to look when matching a
 *  sample to the reference line. Kept tight so parallel stretches of track
 *  can't capture a sample. */
const LINE_SEARCH_BACK = 4;
const LINE_SEARCH_AHEAD = 8;
/** How far a trace's integrated lap length may sit from the field's before we
 *  stop trusting its section split. mergeDistance walks a polyline through
 *  ~3.7 Hz location fixes; laps normally land within ~1% of each other, so a
 *  trace several percent short has a locally distorted distance axis. The
 *  lap-fraction normalisation stretches it uniformly, which keeps the total
 *  honest but puts the section boundaries at the wrong track positions — time
 *  then shuffles between corners and straights. Seen in the wild: a lap 6.7%
 *  short reported -9.2 s through the corners and +12.4 s on the straights for
 *  a car only 3.1 s off the lap. */
const MAX_LAP_LENGTH_DEVIATION = 0.03;

interface Point {
  dist: number;
  elapsed: number;   // seconds from the trace's own first sample
  speed: number;
  throttle: number;
  brake: number;
  x: number;
  y: number;
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
  x: number[];
  y: number[];
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
      x: p.x ?? 0,
      y: p.y ?? 0,
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
  const x: number[] = [];
  const y: number[] = [];
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
    x.push(a.x + frac * (b.x - a.x));
    y.push(a.y + frac * (b.y - a.y));
    // Throttle and brake only drive boundary detection, where a step reads
    // truer than a ramp — take the sample we're sitting on.
    throttle.push(a.throttle);
    brake.push(a.brake);
  }
  // The axis is anchored on the lap's own duration, so pin the final elapsed
  // value rather than letting interpolation drift off it.
  elapsed[elapsed.length - 1] = p.lapTime;
  return { elapsed, speed, throttle, brake, x, y };
}

/** A reference racing line: position plus cumulative arc length, in metres. */
interface RefLine { x: number[]; y: number[]; s: number[]; length: number }

/** Build the reference line from a prepared trace's own position fixes. */
function buildRefLine(p: Prepared): RefLine | null {
  const x: number[] = [], y: number[] = [], s: number[] = [];
  let cum = 0;
  for (const pt of p.pts) {
    if (pt.x === 0 && pt.y === 0) continue;
    if (x.length) {
      const dx = pt.x - x[x.length - 1], dy = pt.y - y[y.length - 1];
      const step = Math.sqrt(dx * dx + dy * dy) / LOC_TO_METERS;
      if (step <= 0) continue;
      cum += step;
    }
    x.push(pt.x); y.push(pt.y); s.push(cum);
  }
  if (x.length < 30 || cum < 500) return null;
  return { x, y, s, length: cum };
}

/** Project a trace onto the reference line, giving each of its samples a
 *  position along that line.
 *
 *  This is what keeps the traces aligned. Timing each lap by its own
 *  integrated distance assumes mergeDistance's polyline error is spread evenly
 *  around the lap; it isn't, and once sections are only a hundred metres long
 *  the leftover drift is enough to shuffle whole tenths between a corner and
 *  the straight beside it. Matching on position instead removes start-line
 *  offset, scale error and local distortion in one step, because both laps are
 *  then measured against the same piece of tarmac.
 *
 *  The search walks forward only, within a window of the last match, so a
 *  circuit that crosses or doubles back on itself can't snap a sample to the
 *  wrong passage. */
function projectOntoRefLine(p: Prepared, ref: RefLine): { s: number; elapsed: number; speed: number }[] | null {
  const out: { s: number; elapsed: number; speed: number }[] = [];
  const spacing = ref.length / Math.max(1, ref.s.length - 1);
  let cursor = 0;
  let prevDist: number | null = null;

  for (const pt of p.pts) {
    if (pt.x === 0 && pt.y === 0) continue;
    // The trace's own distance step is locally reliable even when its total is
    // scaled wrong, so use it to predict how far along the line to look. A
    // window anchored on that prediction stays narrow enough that a circuit
    // running back alongside itself can't pull a sample onto the parallel
    // passage.
    const stepM = prevDist == null ? 0 : Math.max(0, pt.dist - prevDist);
    const predicted = cursor + Math.round(stepM / spacing);
    const lo = Math.max(cursor, predicted - LINE_SEARCH_BACK);
    const hi = Math.min(ref.x.length - 1, predicted + LINE_SEARCH_AHEAD);
    prevDist = pt.dist;

    let bestI = -1, bestD2 = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = ref.x[i] - pt.x, dy = ref.y[i] - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; }
    }
    if (bestI < 0) break;
    cursor = bestI;
    const sHere = ref.s[bestI];
    // Monotonic by construction, but guard against a repeated match.
    if (out.length && sHere <= out[out.length - 1].s) continue;
    out.push({ s: sHere, elapsed: pt.elapsed, speed: pt.speed });
  }
  return out.length >= 20 ? out : null;
}

/** Turn radius (m) at each grid point of the reference racing line, from the
 *  heading change over a fixed baseline either side. Straights come back as
 *  Infinity. Position fixes are decimetres (see lib/telemetry.ts). */
function radiusProfile(x: number[], y: number[], stepM: number): number[] {
  const n = x.length;
  const win = Math.max(1, Math.round(CURVATURE_WINDOW_M / stepM));
  const radius = new Array<number>(n).fill(Infinity);
  for (let i = win; i < n - win; i++) {
    const h1 = Math.atan2(y[i] - y[i - win], x[i] - x[i - win]);
    const h2 = Math.atan2(y[i + win] - y[i], x[i + win] - x[i]);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const kappa = Math.abs(dh) / (win * stepM);   // rad per metre
    radius[i] = kappa > 0 ? 1 / kappa : Infinity;
  }
  // The window can't reach the first and last points; carry the nearest
  // measured value in so the start/finish straight isn't misread.
  for (let i = 0; i < win; i++) { radius[i] = radius[win]; radius[n - 1 - i] = radius[n - 1 - win]; }
  return radius;
}

/** Corner zones straight off the track geometry. Returns null when the
 *  position fixes are unusable, so the caller can fall back. */
function findCornerZonesGeometric(
  x: number[],
  y: number[],
  step: number,
): { start: number; end: number; apexes: number }[] | null {
  if (!x.some((v, i) => v !== 0 || y[i] !== 0)) return null;
  const radius = radiusProfile(x, y, step);
  if (!radius.some(r => isFinite(r))) return null;

  const runs: { start: number; end: number; apexes: number }[] = [];
  let start = -1;
  for (let i = 0; i < radius.length; i++) {
    const tight = radius[i] <= CORNER_RADIUS_M;
    if (tight && start < 0) start = i;
    else if (!tight && start >= 0) { runs.push({ start, end: i - 1, apexes: 1 }); start = -1; }
  }
  if (start >= 0) runs.push({ start, end: radius.length - 1, apexes: 1 });

  const minLen = Math.max(1, Math.round(MIN_CORNER_M / step));
  const kept = runs.filter(r => r.end - r.start >= minLen);
  if (!kept.length) return null;

  // Chicanes and esses read as separate curvature runs a few tens of metres
  // apart; they're one section, but each element is still a turn.
  const gap = Math.max(1, Math.round(MERGE_GAP_M / step));
  const merged: typeof kept = [];
  for (const r of kept) {
    const prev = merged[merged.length - 1];
    if (prev && r.start - prev.end <= gap) { prev.end = r.end; prev.apexes += r.apexes; }
    else merged.push({ ...r });
  }
  return merged;
}

/** Corner zones as [startIdx, endIdx] index pairs on the grid, plus how many
 *  apexes each zone swallowed (a chicane is one zone but two turns).
 *
 *  Fallback for laps with no usable position fixes, where geometry isn't
 *  available. `brake` is the hardest braking across the traces and `throttle`
 *  the most conservative, so a zone runs from the earliest braking point to
 *  the point every lap is back at full throttle. Note this misses corners
 *  taken flat — the reason geometry is preferred when we have it. */
function findCornerZonesFromDriving(
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

/** Drop traces whose integrated lap length disagrees with the field — their
 *  section split can't be trusted (see MAX_LAP_LENGTH_DEVIATION). Needs at
 *  least three traces to have a field to compare against; with two there's no
 *  way to tell which one is wrong, so both are kept. */
function countPositioned(r: Resampled): number {
  let n = 0;
  for (let i = 0; i < r.x.length; i++) if (r.x[i] !== 0 || r.y[i] !== 0) n++;
  return n;
}

function dropDistortedTraces(prepared: Prepared[]): Prepared[] {
  if (prepared.length < 3) return prepared;
  const lengths = prepared.map(p => p.endDist - p.startDist).sort((a, b) => a - b);
  const mid = lengths.length >> 1;
  const median = lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
  if (median <= 0) return prepared;
  const kept = prepared.filter(p =>
    Math.abs((p.endDist - p.startDist) - median) / median <= MAX_LAP_LENGTH_DEVIATION);
  // If the filter would gut the set then the median itself is suspect, and
  // showing everything beats showing two arbitrary survivors.
  return kept.length >= Math.max(2, prepared.length - Math.ceil(prepared.length / 3)) ? kept : prepared;
}

/** Resample a trace onto the reference line, at the same lap fractions the
 *  rest of the pipeline uses. Elapsed times are rescaled so the lap still
 *  spans exactly its own duration — the section times then sum to the lap time
 *  as before, but the boundaries now sit at true track positions. */
function resampleOnRefLine(p: Prepared, ref: RefLine, fractions: number[]): Resampled | null {
  const proj = projectOntoRefLine(p, ref);
  if (!proj) return null;

  const at = (target: number) => {
    if (target <= proj[0].s) return proj[0];
    const last = proj[proj.length - 1];
    if (target >= last.s) return last;
    let lo = 0, hi = proj.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (proj[mid].s <= target) lo = mid; else hi = mid;
    }
    const f = (target - proj[lo].s) / (proj[hi].s - proj[lo].s || 1);
    return {
      s: target,
      elapsed: proj[lo].elapsed + f * (proj[hi].elapsed - proj[lo].elapsed),
      speed: proj[lo].speed + f * (proj[hi].speed - proj[lo].speed),
    };
  };

  const base = at(0).elapsed;
  const spanTime = at(ref.length).elapsed - base;
  // Projection can clip a fraction of a sample at either end; stretch the
  // elapsed axis back onto the lap's known duration so totals stay exact.
  const scale = spanTime > 0 ? p.lapTime / spanTime : 1;

  const elapsed: number[] = [], speed: number[] = [];
  const throttle: number[] = [], brake: number[] = [];
  const x: number[] = [], y: number[] = [];
  for (const u of fractions) {
    const target = u * ref.length;
    const v = at(target);
    elapsed.push((v.elapsed - base) * scale);
    speed.push(v.speed);
    // Interpolate the position along the line rather than snapping to the
    // nearest fix. The grid is finer than the reference points, so snapping
    // would quantise the line into steps and the curvature pass would read
    // those steps as corners.
    let lo = 0, hi = ref.s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ref.s[mid] <= target) lo = mid; else hi = mid; }
    const segLen = ref.s[hi] - ref.s[lo];
    const g = segLen > 0 ? (target - ref.s[lo]) / segLen : 0;
    x.push(ref.x[lo] + g * (ref.x[hi] - ref.x[lo]));
    y.push(ref.y[lo] + g * (ref.y[hi] - ref.y[lo]));
    // Throttle and brake only feed the fallback detector, which isn't reached
    // on this path — the reference line's geometry drives the sections here.
    throttle.push(0); brake.push(0);
  }
  elapsed[elapsed.length - 1] = p.lapTime;
  return { elapsed, speed, throttle, brake, x, y };
}

export function compareLapSegments(traces: SegmentTrace[]): SegmentComparison | null {
  const prepared = dropDistortedTraces(traces.map(prepare).filter((p): p is Prepared => p != null));
  if (prepared.length < 2) return null;

  // Lap length varies a little between traces because mergeDistance integrates
  // a polyline through ~3.7 Hz location fixes; the mean is the honest number
  // to put on the axis.
  const lapLength = prepared.reduce((a, p) => a + (p.endDist - p.startDist), 0) / prepared.length;
  const step = lapLength / (GRID_POINTS - 1);
  const fractions = Array.from({ length: GRID_POINTS }, (_, i) => i / (GRID_POINTS - 1));

  // Preferred path: put every trace on one reference racing line by position,
  // so all of them are measured against the same tarmac. Falls back to each
  // lap's own distance axis when there aren't enough position fixes.
  const positioned = prepared
    .map(p => ({ p, n: p.pts.reduce((n, q) => n + (q.x !== 0 || q.y !== 0 ? 1 : 0), 0) }))
    .sort((a, b) => b.n - a.n);
  const refLine = positioned[0].n > 30 ? buildRefLine(positioned[0].p) : null;

  const sampled = prepared.map(p => {
    if (refLine) {
      const r = resampleOnRefLine(p, refLine, fractions);
      if (r) return { trace: p.trace, r };
    }
    return { trace: p.trace, r: resample(p, fractions) };
  });

  // Geometry first: it describes the circuit rather than the driving, so the
  // split is identical however many cars are in the comparison and can be
  // checked against a circuit map. The reference line is whichever trace has
  // the most usable position fixes.
  const geoRef = sampled.reduce((best, cur) =>
    countPositioned(cur.r) > countPositioned(best.r) ? cur : best);
  let zones = findCornerZonesGeometric(geoRef.r.x, geoRef.r.y, step);
  const fromGeometry = zones != null;

  if (!zones) {
    // No usable position fixes — read the corners off the driving instead.
    const profile = fractions.map((_, i) =>
      sampled.reduce((sum, t) => sum + t.r.speed[i], 0) / sampled.length);
    const brakeMax = fractions.map((_, i) => Math.max(...sampled.map(t => t.r.brake[i])));
    const throttleMin = fractions.map((_, i) => Math.min(...sampled.map(t => t.r.throttle[i])));
    zones = findCornerZonesFromDriving(profile, brakeMax, throttleMin, step);
  }
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
      startIdx: r.start,
      endIdx: r.end,
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
    path: fromGeometry ? geoRef.r.x.map((x, i) => ({ x, y: geoRef.r.y[i] })) : [],
    fromGeometry,
    totals,
    baselineLabel: sampled[baselineIdx].trace.label,
    cornerCount: cornerSegs.length,
    straightCount: straightSegs.length,
    cornerDistance: cornerSegs.reduce((a, s) => a + s.length, 0),
    straightDistance: straightSegs.reduce((a, s) => a + s.length, 0),
    trackDistance: lapLength,
  };
}
