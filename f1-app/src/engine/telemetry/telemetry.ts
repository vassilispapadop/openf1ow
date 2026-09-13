const LOC_TO_METERS = 10;

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
