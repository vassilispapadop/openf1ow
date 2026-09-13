// The canonical derived-session model. buildSessionModel() turns raw OpenF1
// rows into this once; every analysis and every card reads from it. Nothing
// here is formatted — seconds are seconds, timestamps are epoch ms.

import type {
  Driver, Lap, Stint, Pit, Weather, SessionInfo, MeetingInfo, RaceControlMsg,
} from "./raw.ts";
import type { Fit, Gated } from "./gated.ts";

export type SessionKind = "race" | "qualifying" | "practice" | "unknown";

/** Bit flags on a lap. A bitmask so the flags serialise as one integer and
 *  membership tests are branch-free. A lap is `clean` when none of the bits
 *  in CLEAN_MASK is set and it has a duration. */
export const LapFlag = {
  LAP1: 1,               // opening lap of a race (standing start)
  FORMATION: 2,          // no timed lap (lap_duration null on lap 1)
  PIT_IN: 4,             // lap ending in the pits (pit.lap_number)
  PIT_OUT: 8,            // is_pit_out_lap, or the lap after a pit lap
  SC: 16,                // overlaps a safety-car window
  VSC: 32,               // overlaps a virtual safety-car window
  RED: 64,               // overlaps a red-flag stoppage
  YELLOW: 128,           // ≥ 20 % of the lap under a sector yellow
  RESTART: 256,          // first flying lap after a red flag
  RETIRED_AFTER: 512,    // driver classified as retired before/at this lap
  NO_TIME: 1024,         // no lap_duration
  OUTLIER: 2048,         // robust per-stint outlier (traffic, mistake, damage)
  DIRTY: 4096,           // < 1.5 s behind the car ahead at the start of the lap
  LAPPED: 8192,          // interval reports "+N LAP" — being lapped
  LAPPING: 16384,        // the car ahead is a lap (or more) down
  WET: 32768,            // rain reported by the joined weather sample
  DRS_RANGE: 65536,      // < 1.0 s behind the car ahead
} as const;

export type LapFlagName = keyof typeof LapFlag;

/** Any of these on a lap makes it unrepresentative of pace. Traffic flags
 *  are deliberately NOT here: a dirty lap is still a real lap (clean) — it is
 *  just not clear-air. */
export const CLEAN_MASK =
  LapFlag.LAP1 | LapFlag.FORMATION | LapFlag.PIT_IN | LapFlag.PIT_OUT |
  LapFlag.SC | LapFlag.VSC | LapFlag.RED | LapFlag.YELLOW | LapFlag.RESTART |
  LapFlag.RETIRED_AFTER | LapFlag.NO_TIME | LapFlag.OUTLIER;

export const TRAFFIC_MASK = LapFlag.DIRTY | LapFlag.LAPPED | LapFlag.LAPPING;

export function hasFlag(flags: number, f: number): boolean {
  return (flags & f) !== 0;
}

export function flagNames(flags: number): LapFlagName[] {
  return (Object.keys(LapFlag) as LapFlagName[]).filter(k => (flags & LapFlag[k]) !== 0);
}

export interface LapWeather {
  trackTemp: number;
  airTemp: number;
  rain: boolean;
  humidity: number;
  windSpeed: number;
  ageSec: number;            // |weather sample − lap start|
}

export interface EnrichedLap extends Lap {
  key: string;               // `${driver_number}-${lap_number}`
  tStart: number;            // epoch ms (NaN when date_start missing)
  tEnd: number | null;       // tStart + duration, else the next lap's tStart
  flags: number;
  clean: boolean;            // (flags & CLEAN_MASK) === 0 && lap_duration > 0
  clearAir: boolean;         // clean && (flags & TRAFFIC_MASK) === 0
  stintNumber: number | null;
  compound: string | null;   // upper-cased
  tyreAge: number | null;    // tyre_age_at_start + laps into the stint
  fuelKg: number | null;     // estimated fuel on board at the start of the lap
  fuelCorrected: number | null;  // lap_duration − fuelKg × secPerKg (to race-end fuel)
  gapAhead: number | null;   // seconds to the car ahead at lap start (from /intervals)
  gapToLeader: number | null;
  carAhead: number | null;   // driver_number of the car immediately ahead on track
  position: number | null;   // race position at lap start
  neutralisation: number | null;   // index into SessionModel.neutralisations
  weather: LapWeather | null;
}

export interface Neutralisation {
  kind: "SC" | "VSC" | "RED" | "YELLOW";
  tStart: number;
  tEnd: number;
  lapStart: number;          // leader lap numbers (best effort)
  lapEnd: number;
  sector: 1 | 2 | 3 | null;  // sector yellows only
  messages: RaceControlMsg[];
}

export interface FuelModel {
  startKg: number;           // 110 for a Grand Prix, 40 for a sprint
  kgPerLap: number;
  secPerKg: number;          // fitted per race when the data allows, else 0.055
  source: "fitted" | "default";
  fitPairs: number;          // same-compound equal-tyre-age lap pairs behind the fit
  fitIqr: number | null;
  sprint: boolean;
}

export interface Cliff {
  atTyreAge: number;
  slopeBefore: number;
  slopeAfter: number;
  deltaBic: number;
}

export interface EnrichedStint extends Stint {
  driverNumber: number;
  laps: EnrichedLap[];       // every lap in [lap_start, lap_end] that exists
  fitLaps: EnrichedLap[];    // clean ∧ clearAir ∧ tyreAge ≥ 2 ∧ ¬PIT_IN — what the fit uses
  deg: Gated<Fit>;           // x = tyre age, y = fuel-corrected time; negative allowed
  cliff: Gated<Cliff>;
  medianClear: number | null;  // median fuel-corrected clear-air time in the stint
  lengthLaps: number;
}

export interface EnrichedPit extends Pit {
  tStart: number;
  inLapKey: string;
  outLapKey: string;
  stationary: number | null;   // pit_duration ?? stop_duration
  laneTime: number | null;     // lane_duration
  /** The metric this session ranks stops by (decided once, see model.pitMetric). */
  duration: number | null;
  underNeutralisation: number | null;   // index into neutralisations, if the stop was under SC/VSC/RED
}

export type ClassificationStatus = "finished" | "retired" | "dsq" | "dns" | "unknown";

export interface Classification {
  position: number | null;
  status: ClassificationStatus;
  lapsCompleted: number;
  retiredLap: number | null;
  gapToLeader: number | string | null;
  points: number | null;
}

export interface DriverSummary {
  driver: Driver;
  team: string;
  classification: Classification;
  gridPosition: number | null;
  gridSource: "starting_grid" | "qualifying_result" | "first_position" | null;
  stints: EnrichedStint[];
  pits: EnrichedPit[];
  laps: EnrichedLap[];
  cleanLapCount: number;
  clearAirLapCount: number;
}

export interface TeamSummary {
  name: string;
  color: string;             // hex without '#'
  drivers: Driver[];         // every driver who ran for the team — never sliced to two
}

export interface Coverage {
  stints: boolean;
  pits: boolean;
  intervals: boolean;
  position: boolean;
  raceControl: boolean;
  results: boolean;
  weather: boolean;
  startingGrid: boolean;
  overtakes: boolean;
}

export interface SessionModel {
  info: SessionInfo;
  meeting: MeetingInfo | null;
  kind: SessionKind;
  sprint: boolean;
  totalLaps: number;         // the winner's lap count (race), else the max lap seen
  raceStart: number | null;  // epoch ms of the first timed lap's start
  chequered: number | null;
  drivers: DriverSummary[];
  byDriver: Record<number, DriverSummary>;
  laps: EnrichedLap[];
  lapByKey: Record<string, EnrichedLap>;
  lapsByNumber: Record<number, EnrichedLap[]>;
  teams: Record<string, TeamSummary>;
  neutralisations: Neutralisation[];
  fuel: FuelModel;
  weather: Weather[];
  /** Which pit-duration field this session's stops are compared on. */
  pitMetric: "stationary" | "lane" | null;
  overtakes: import("./raw.ts").OvertakeRow[];
  coverage: Coverage;
  warnings: string[];        // data-quality notes worth surfacing in the UI
}
