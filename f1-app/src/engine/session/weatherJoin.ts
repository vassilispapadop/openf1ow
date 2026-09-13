// Nearest weather sample to a lap start, but only when it is close enough to
// mean something — the feed has gaps, and a lap should not inherit a track
// temperature from twenty minutes earlier.

import type { Weather } from "../types/raw.ts";
import type { LapWeather } from "../types/model.ts";
import { parseTs } from "./timeline.ts";
import { lastIndexLE } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface WeatherIndex {
  has: boolean;
  at(t: number): LapWeather | null;
}

export function buildWeatherIndex(weather: Weather[] | null | undefined): WeatherIndex {
  const rows = (weather ?? [])
    .map(w => ({ t: parseTs(w.date), w }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const maxAge = GATES.WEATHER_MAX_AGE_S * 1000;
  return {
    has: rows.length > 0,
    at(t: number): LapWeather | null {
      if (!rows.length || !Number.isFinite(t)) return null;
      const i = lastIndexLE(rows, x => x.t, t);
      const cands = [rows[i], rows[i + 1]].filter(Boolean);
      let best: { t: number; w: Weather } | null = null;
      for (const c of cands) if (!best || Math.abs(c.t - t) < Math.abs(best.t - t)) best = c;
      if (!best || Math.abs(best.t - t) > maxAge) return null;
      const w = best.w;
      return {
        trackTemp: w.track_temperature,
        airTemp: w.air_temperature,
        rain: w.rainfall === true || (typeof w.rainfall === "number" && w.rainfall > 0),
        humidity: w.humidity,
        windSpeed: w.wind_speed,
        ageSec: Math.abs(best.t - t) / 1000,
      };
    },
  };
}
