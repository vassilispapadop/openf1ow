// Module-scoped per-year cache so subsequent loads of the same year are free.

import type { SeasonTrends } from "./seasonUtils";

const cache = new Map<string, Promise<SeasonTrends | null>>();

export function loadSeasonTrends(year: number | string): Promise<SeasonTrends | null> {
  const k = String(year);
  const hit = cache.get(k);
  if (hit) return hit;
  const p = fetch(`/api/season-trends/${k}`)
    .then(r => (r.ok ? r.json() as Promise<SeasonTrends> : null))
    .catch(() => null);
  cache.set(k, p);
  return p;
}
