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
  /** Lap keys whose time race control deleted. */
  deleted?: Set<string>;
}

function stintFor(stints: Stint[], driver: number, lap: number): Stint | null {
  for (const s of stints) {
    if (s.driver_number === driver && lap >= s.lap_start && lap <= s.lap_end) return s;
  }
  return null;
}

export function enrichLaps(laps: Lap[], ctx: EnrichContext): { laps: EnrichedLap[]; fuel: FuelModel } {
  // Which lap a pit record sits on depends on the session: in a race it is the
  // in-lap (the stop happens during it, the next lap is the out-lap) — also
  // for back-to-back stops, where a lap is both; in qualifying and practice it
  // is the out-lap itself (the car leaving the garage). Assuming the race
  // convention everywhere flagged every qualifying push lap as a pit-out lap
  // and dropped it from "best lap".
  const pitInKeys = new Set<string>();
  const pitOutKeys = new Set<string>();
  for (const p of ctx.pits) {
    const inLap = ctx.kind === "race" ? p.lap_number : p.lap_number - 1;
    pitInKeys.add(`${p.driver_number}-${inLap}`);
    pitOutKeys.add(`${p.driver_number}-${inLap + 1}`);
  }

  // Restart laps: for each driver, the first lap that starts once a safety
  // car, VSC or red-flag window has closed. Cold tyres and brakes, a bunched
  // field and no DRS make it as unrepresentative as an opening lap — and
  // after a start behind the safety car that went to the grid, it *is* the
  // opening lap. Found by earliest start rather than first-seen, so the
  // order laps arrive in doesn't matter.
  const restartKeys = new Set<string>();
  for (const n of ctx.neutralisations) {
    if (n.kind === "YELLOW") continue;
    const firstAfter = new Map<number, { t: number; key: string }>();
    for (const l of laps) {
      const key = `${l.driver_number}-${l.lap_number}`;
      const t = ctx.times[key];
      if (!t || !Number.isFinite(t.tStart) || t.tStart < n.tEnd) continue;
      const cur = firstAfter.get(l.driver_number);
      if (!cur || t.tStart < cur.t) firstAfter.set(l.driver_number, { t: t.tStart, key });
    }
    for (const v of firstAfter.values()) restartKeys.add(v.key);
  }

  const out: EnrichedLap[] = laps.map(l => {
    const key = `${l.driver_number}-${l.lap_number}`;
    const t = ctx.times[key] ?? { tStart: NaN, tEnd: null };
    let flags = 0;

    if (ctx.kind === "race" && l.lap_number === 1) flags |= LapFlag.LAP1;
    if (!l.lap_duration || l.lap_duration <= 0) {
      flags |= LapFlag.NO_TIME;
      if (l.lap_number === 1) flags |= LapFlag.FORMATION;
    }
    if (pitInKeys.has(key)) flags |= LapFlag.PIT_IN;
    if (l.is_pit_out_lap || pitOutKeys.has(key)) flags |= LapFlag.PIT_OUT;

    const cls = ctx.classification[l.driver_number];
    if (cls?.retiredLap != null && l.lap_number > cls.retiredLap) flags |= LapFlag.RETIRED_AFTER;

    if (restartKeys.has(key)) flags |= LapFlag.RESTART;
    if (ctx.deleted?.has(key)) flags |= LapFlag.DELETED;

    let neutralisation: number | null = null;
    if (Number.isFinite(t.tStart) && t.tEnd != null) {
      ctx.neutralisations.forEach((n, i) => {
        const frac = overlapFraction(t.tStart, t.tEnd as number, n.tStart, n.tEnd);
        if (frac <= 0) return;
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
