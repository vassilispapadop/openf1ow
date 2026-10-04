// Top speeds: the speed trap and the two intermediates, per driver and per
// team, for any session kind. Where the timing feed's intervals exist, the
// trap is split into clear-air readings (≥ 1.5 s to the car ahead) and
// readings in a tow (< 1.0 s), because a tow is worth several km/h and the
// two should not be ranked together.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { median } from "../stats.ts";
import { DIRTY_AIR_THRESHOLD, DRS_RANGE_THRESHOLD } from "../gates.ts";
import { LapFlag, hasFlag } from "../types/model.ts";

export interface SpeedReading { speed: number; lap: number }

export interface DriverSpeeds {
  driver: Driver;
  team: string;
  trap: SpeedReading | null;         // best speed-trap reading, any lap
  trapClear: SpeedReading | null;    // best with clear air (or unknown gap) ahead
  trapTow: SpeedReading | null;      // best within DRS range of the car ahead
  trapMedian: number | null;
  i1: SpeedReading | null;           // best at intermediate 1
  i2: SpeedReading | null;
  n: number;                         // laps with a trap reading
}

export interface TeamSpeeds { team: string; color: string; trap: SpeedReading & { driver: Driver } | null }

export interface TopSpeeds {
  drivers: DriverSpeeds[];           // ranked by best trap
  teams: TeamSpeeds[];               // ranked by best trap
  fieldBest: { trap: (SpeedReading & { driver: Driver }) | null; i1: (SpeedReading & { driver: Driver }) | null; i2: (SpeedReading & { driver: Driver }) | null };
  towSplit: boolean;                 // intervals were available, so clear/tow is meaningful
}

/** Laps whose speeds count: timed, not under a red flag or the safety car
 *  (a trap reading behind the safety car is not a top speed), and not the
 *  opening lap or a restart lap — full tanks, a bunched field and no DRS, so
 *  a "tow" there is a slipstream at race-start speeds, not a DRS tow. At
 *  Kuala Lumpur 2026 those laps were also wet, and put 262 km/h "in a tow"
 *  against 347 in clear air. */
function usable(l: EnrichedLap): boolean {
  return !!l.lap_duration && l.lap_duration > 0 &&
    !hasFlag(l.flags, LapFlag.RED | LapFlag.SC | LapFlag.VSC | LapFlag.LAP1 | LapFlag.RESTART);
}

/** A reading also has to come from a lap the driver was actually pushing on:
 *  within 7% of their own best usable lap, the qualifying cut-off. That drops
 *  in- and out-laps in qualifying and practice, and in a race the laps on a
 *  damp or drying track, cruising to the flag, or nursing damage — a tow on a
 *  112 s lap at a 101 s circuit tells you nothing about the tow. */
const REPRESENTATIVE_FRAC = 1.07;

function representative(laps: EnrichedLap[]): EnrichedLap[] {
  let best = Infinity;
  for (const l of laps) if ((l.lap_duration as number) < best) best = l.lap_duration as number;
  return isFinite(best) ? laps.filter(l => (l.lap_duration as number) <= best * REPRESENTATIVE_FRAC) : laps;
}

function best(laps: EnrichedLap[], key: "st_speed" | "i1_speed" | "i2_speed"): SpeedReading | null {
  let out: SpeedReading | null = null;
  for (const l of laps) {
    const v = l[key];
    if (v != null && v > 0 && (!out || v > out.speed)) out = { speed: v, lap: l.lap_number };
  }
  return out;
}

export function topSpeeds(model: SessionModel): Gated<TopSpeeds> {
  const towSplit = model.coverage.intervals;
  const drivers: DriverSpeeds[] = [];
  for (const d of model.drivers) {
    const laps = representative(d.laps.filter(usable));
    const withTrap = laps.filter(l => l.st_speed != null && l.st_speed > 0);
    if (!withTrap.length && !laps.some(l => l.i1_speed || l.i2_speed)) continue;
    const clear = towSplit ? withTrap.filter(l => l.gapAhead == null || l.gapAhead >= DIRTY_AIR_THRESHOLD) : withTrap;
    const tow = towSplit ? withTrap.filter(l => l.gapAhead != null && l.gapAhead < DRS_RANGE_THRESHOLD) : [];
    drivers.push({
      driver: d.driver, team: d.team,
      trap: best(withTrap, "st_speed"),
      trapClear: best(clear, "st_speed"),
      trapTow: best(tow, "st_speed"),
      trapMedian: withTrap.length ? median(withTrap.map(l => l.st_speed as number)) : null,
      i1: best(laps, "i1_speed"), i2: best(laps, "i2_speed"),
      n: withTrap.length,
    });
  }
  if (!drivers.length) return gate("no_data");
  drivers.sort((a, b) => (b.trap?.speed ?? 0) - (a.trap?.speed ?? 0));

  const teamsMap: Record<string, TeamSpeeds> = {};
  for (const r of drivers) {
    const t = (teamsMap[r.team] ||= { team: r.team, color: model.teams[r.team]?.color ?? r.driver.team_colour ?? "666", trap: null });
    if (r.trap && (!t.trap || r.trap.speed > t.trap.speed)) t.trap = { ...r.trap, driver: r.driver };
  }
  const teams = Object.values(teamsMap).sort((a, b) => (b.trap?.speed ?? 0) - (a.trap?.speed ?? 0));

  const fieldBest = <K extends "trap" | "i1" | "i2">(k: K) => {
    let out: (SpeedReading & { driver: Driver }) | null = null;
    for (const r of drivers) { const v = r[k]; if (v && (!out || v.speed > out.speed)) out = { ...v, driver: r.driver }; }
    return out;
  };
  return ok({ drivers, teams, fieldBest: { trap: fieldBest("trap"), i1: fieldBest("i1"), i2: fieldBest("i2") }, towSplit },
    drivers.reduce((s, r) => s + r.n, 0), drivers.length >= 10 ? "high" : "medium",
    towSplit ? undefined : ["Timing intervals not available for this session, so trap speeds are not split into clear-air and tow."]);
}
