// Turns raw laps into EnrichedLaps: timestamps, structural flags, stint and
// tyre age, traffic state, weather, fuel correction, and the robust outlier
// pass. `clean` and `clearAir` are derived from the flags at the end.

import type { Lap, Pit, Stint } from "../types/raw.ts";
import {
  LapFlag, CLEAN_MASK, TRAFFIC_MASK,
  type EnrichedLap, type FuelModel, type Neutralisation, type Classification, type SessionKind,
} from "../types/model.ts";
import type { LapTimes } from "./timeline.ts";
import type { TrafficIndex } from "./intervalsJoin.ts";
import type { WeatherIndex } from "./weatherJoin.ts";
import { overlapFraction } from "./neutralisations.ts";
import { fuelKgAtLap, fuelCorrect, fitSecPerKg } from "./fuel.ts";
import { flagOutliers } from "./outliers.ts";
import { DIRTY_AIR_THRESHOLD, DRS_RANGE_THRESHOLD } from "../gates.ts";

const YELLOW_MIN_OVERLAP = 0.2;

export interface EnrichContext {
  kind: SessionKind;
  times: Record<string, LapTimes>;
  stints: Stint[];
  pits: Pit[];
  neutralisations: Neutralisation[];
  classification: Record<number, Classification>;
  traffic: TrafficIndex;
  weather: WeatherIndex;
  fuel: FuelModel;
}

function stintFor(stints: Stint[], driver: number, lap: number): Stint | null {
  for (const s of stints) {
    if (s.driver_number === driver && lap >= s.lap_start && lap <= s.lap_end) return s;
  }
  return null;
}

export function enrichLaps(laps: Lap[], ctx: EnrichContext): { laps: EnrichedLap[]; fuel: FuelModel } {
  const pitLaps = new Set(ctx.pits.map(p => `${p.driver_number}-${p.lap_number}`));
  const redRestartSeen = new Set<string>();   // `${driver}|${redIndex}`

  const out: EnrichedLap[] = laps.map(l => {
    const key = `${l.driver_number}-${l.lap_number}`;
    const t = ctx.times[key] ?? { tStart: NaN, tEnd: null };
    let flags = 0;

    if (ctx.kind === "race" && l.lap_number === 1) flags |= LapFlag.LAP1;
    if (!l.lap_duration || l.lap_duration <= 0) {
      flags |= LapFlag.NO_TIME;
      if (l.lap_number === 1) flags |= LapFlag.FORMATION;
    }
    if (pitLaps.has(key)) flags |= LapFlag.PIT_IN;
    if (l.is_pit_out_lap || pitLaps.has(`${l.driver_number}-${l.lap_number - 1}`)) flags |= LapFlag.PIT_OUT;

    const cls = ctx.classification[l.driver_number];
    if (cls?.retiredLap != null && l.lap_number > cls.retiredLap) flags |= LapFlag.RETIRED_AFTER;

    let neutralisation: number | null = null;
    if (Number.isFinite(t.tStart) && t.tEnd != null) {
      ctx.neutralisations.forEach((n, i) => {
        const frac = overlapFraction(t.tStart, t.tEnd as number, n.tStart, n.tEnd);
        if (frac <= 0) {
          // First flying lap after a red flag restarts: it begins at or after
          // the window closed and is the driver's first such lap.
          if (n.kind === "RED" && t.tStart >= n.tEnd && !redRestartSeen.has(`${l.driver_number}|${i}`)) {
            redRestartSeen.add(`${l.driver_number}|${i}`);
            flags |= LapFlag.RESTART;
          }
          return;
        }
        if (n.kind === "YELLOW") {
          if (frac >= YELLOW_MIN_OVERLAP) { flags |= LapFlag.YELLOW; neutralisation ??= i; }
          return;
        }
        flags |= n.kind === "SC" ? LapFlag.SC : n.kind === "VSC" ? LapFlag.VSC : LapFlag.RED;
        neutralisation ??= i;
      });
    }

    const traffic = ctx.traffic.trafficFor(l.driver_number, l.lap_number, t.tStart);
    if (traffic.lapped) flags |= LapFlag.LAPPED;
    if (traffic.lapping) flags |= LapFlag.LAPPING;
    if (traffic.gapAhead != null) {
      if (traffic.gapAhead < DIRTY_AIR_THRESHOLD) flags |= LapFlag.DIRTY;
      if (traffic.gapAhead < DRS_RANGE_THRESHOLD) flags |= LapFlag.DRS_RANGE;
    }

    const weather = ctx.weather.at(t.tStart);
    if (weather?.rain) flags |= LapFlag.WET;

    const st = stintFor(ctx.stints, l.driver_number, l.lap_number);
    const tyreAge = st ? st.tyre_age_at_start + (l.lap_number - st.lap_start) : null;
    const fuelKg = ctx.kind === "race" ? fuelKgAtLap(ctx.fuel, l.lap_number) : null;

    return {
      ...l,
      key,
      tStart: t.tStart,
      tEnd: t.tEnd,
      flags,
      clean: false,
      clearAir: false,
      stintNumber: st?.stint_number ?? null,
      compound: st?.compound ? st.compound.toUpperCase() : null,
      tyreAge,
      fuelKg,
      fuelCorrected: null,
      gapAhead: traffic.gapAhead,
      gapToLeader: traffic.gapToLeader,
      carAhead: traffic.carAhead,
      position: traffic.position,
      neutralisation,
      weather,
    };
  });

  let fuel = ctx.fuel;
  const applyFuel = (m: FuelModel) => {
    for (const l of out) {
      l.fuelCorrected = l.lap_duration && l.lap_duration > 0
        ? (l.fuelKg != null ? fuelCorrect(l.lap_duration, l.fuelKg, m.secPerKg) : l.lap_duration)
        : null;
    }
  };
  const settle = () => {
    flagOutliers(out);
    for (const l of out) {
      l.clean = (l.flags & CLEAN_MASK) === 0 && !!l.lap_duration && l.lap_duration > 0;
      l.clearAir = l.clean && (l.flags & TRAFFIC_MASK) === 0;
    }
  };

  // Pass 1 with the default s/kg, then fit s/kg from the clean laps that
  // produced, then settle again with the fitted value.
  applyFuel(fuel);
  settle();
  if (ctx.kind === "race") {
    const fitted = fitSecPerKg(out);
    if (fitted) {
      fuel = { ...fuel, secPerKg: fitted.secPerKg, source: "fitted", fitPairs: fitted.pairs, fitIqr: fitted.iqr };
      applyFuel(fuel);
      settle();
    }
  }
  return { laps: out, fuel };
}
