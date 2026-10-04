const LOC_TO_METERS = 10;

/** Upstream car_data sometimes freezes: the feed keeps emitting rows with
 *  advancing timestamps while speed, rpm and gear hold their last value and
 *  throttle / brake read 104 — the F1 feed's "no data" sentinel. The location
 *  feed is separate and keeps moving, so distance and timing stay honest; only
 *  the car channels are stale. Seen on 5 of 11 Suzuka 2026 qualifying laps,
 *  one of them frozen at 189 km/h for the final 1.9 km, through 130R and the
 *  chicane. A sample is frozen when it carries the sentinel, or sits in a run
 *  of identical speed + rpm that does: the first few rows of a freeze still
 *  show plausible throttle, while a car genuinely at terminal velocity holds
 *  its speed for a few samples but never with the sentinel. */
export function frozenCarDataMask(
  samples: { speed?: number; rpm?: number; throttle?: number; brake?: number }[],
): boolean[] {
  const n = samples.length;
  const mask = new Array<boolean>(n).fill(false);
  const sentinel = (s: { throttle?: number; brake?: number }) =>
    (s.throttle ?? 0) > 100 || (s.brake ?? 0) > 100;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && samples[j + 1].speed === samples[i].speed && samples[j + 1].rpm === samples[i].rpm) j++;
    let hit = false;
    for (let k = i; k <= j && !hit; k++) hit = sentinel(samples[k]);
    if (hit) for (let k = i; k <= j; k++) mask[k] = true;
    i = j + 1;
  }
  return mask;
}

/** Merge car_data with location data: attach cumulative track distance and
 *  the nearest (x, y) point. The (x, y) propagation lets downstream
 *  visualisations (track maps, dominance maps) skip a separate location
 *  fetch — every merged car_data sample knows where on the circuit it was
 *  sampled. */
export function mergeDistance(cd: any[], loc: any[]): any[] {
  const locTrack: { t: number; distance: number; x: number; y: number }[] = [];
  let cum = 0;
  for (let i = 0; i < loc.length; i++) {
    if (i > 0) {
      const dx = loc[i].x - loc[i - 1].x, dy = loc[i].y - loc[i - 1].y;
      cum += Math.sqrt(dx * dx + dy * dy);
    }
    locTrack.push({
      t: new Date(loc[i].date).getTime(),
      distance: cum / LOC_TO_METERS,
      x: loc[i].x,
      y: loc[i].y,
    });
  }
  if (!locTrack.length) return cd.map(c => ({ ...c, distance: 0, x: 0, y: 0 }));
  return cd.map(c => {
    const t = new Date(c.date).getTime();
    let lo = 0, hi = locTrack.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (locTrack[mid].t < t) lo = mid + 1; else hi = mid;
    }
    let best = lo;
    if (lo > 0 && Math.abs(locTrack[lo - 1].t - t) < Math.abs(locTrack[lo].t - t)) best = lo - 1;
    const ref = locTrack[best];
    return { ...c, distance: ref.distance, x: ref.x, y: ref.y };
  });
}
