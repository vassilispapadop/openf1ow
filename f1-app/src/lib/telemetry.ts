const LOC_TO_METERS = 10;

/** Merge car_data with location data to compute cumulative track distance */
export function mergeDistance(cd: any[], loc: any[]): any[] {
  const locDist: { t: number; distance: number }[] = [];
  let cum = 0;
  for (let i = 0; i < loc.length; i++) {
    if (i > 0) {
      const dx = loc[i].x - loc[i - 1].x, dy = loc[i].y - loc[i - 1].y;
      cum += Math.sqrt(dx * dx + dy * dy);
    }
    locDist.push({ t: new Date(loc[i].date).getTime(), distance: cum / LOC_TO_METERS });
  }
  if (!locDist.length) return cd.map(c => ({ ...c, distance: 0 }));
  return cd.map(c => {
    const t = new Date(c.date).getTime();
    let lo = 0, hi = locDist.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (locDist[mid].t < t) lo = mid + 1; else hi = mid;
    }
    let best = lo;
    if (lo > 0 && Math.abs(locDist[lo - 1].t - t) < Math.abs(locDist[lo].t - t)) best = lo - 1;
    return { ...c, distance: locDist[best].distance };
  });
}
