// OpenF1 API row types, as the API returns them (snake_case). This is the
// engine's only view of the outside world: everything else in src/engine is
// derived from these. Field shapes were taken from real 2026 responses, so
// the nullable ones are nullable because the data is.
//
// Keep this file free of imports — it is shared with the offline scripts.

export interface SessionInfo {
  session_key: number;
  meeting_key: number;
  session_name: string;        // "Race" | "Sprint" | "Qualifying" | "Sprint Qualifying" | "Practice 1" …
  session_type: string;        // "Race" | "Qualifying" | "Practice"
  date_start: string;          // ISO, with offset
  date_end: string;
  circuit_key?: number;
  circuit_short_name?: string;
  country_code?: string;
  country_name?: string;
  location?: string;
  gmt_offset?: string;
  year?: number;
  is_cancelled?: boolean;
}

export interface MeetingInfo {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  circuit_short_name?: string;
  country_name?: string;
  location?: string;
  date_start?: string;
  year?: number;
}

export interface Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;         // hex without '#', e.g. "F47600"
  headshot_url?: string;
  broadcast_name?: string;
  first_name?: string;
  last_name?: string;
  country_code?: string | null;
}

export interface Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  date_start: string;          // may be missing on the very first lap of a session
  st_speed: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  segments_sector_1?: number[];
  segments_sector_2?: number[];
  segments_sector_3?: number[];
}

export interface Stint {
  driver_number: number;
  stint_number: number;
  compound: string;            // "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | occasionally "" / "UNKNOWN"
  lap_start: number;
  lap_end: number;
  tyre_age_at_start: number;
}

export interface Pit {
  driver_number: number;
  lap_number: number;
  date: string;
  /** Pit-lane time in 2026 feeds (identical to lane_duration); older seasons
   *  sometimes carry the stationary time here instead. */
  pit_duration: number | null;
  /** Time stationary in the box. Null for the whole of 2026 so far. */
  stop_duration: number | null;
  /** Pit-lane entry to exit. */
  lane_duration: number | null;
}

export interface Weather {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  /** 0/1 in the feed, but older code treated it as boolean — accept both. */
  rainfall: number | boolean;
  wind_speed: number;
  wind_direction: number | null;
}

/** One timing-screen interval sample. Gaps are seconds, or a "+N LAP(S)"
 *  string for lapped cars; the leader has 0. Published continuously through
 *  the lap (~28k rows for a Grand Prix). */
export interface Interval {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

/** Position changes only — a few hundred rows per race, not one per lap. */
export interface PositionRow {
  date: string;
  driver_number: number;
  position: number;
}

export interface RaceControlMsg {
  date: string;
  category: string;            // "Flag" | "SafetyCar" | "Drs" | "Other" | "SessionStatus" | "CarEvent"
  flag: string | null;         // "GREEN" | "YELLOW" | "DOUBLE YELLOW" | "RED" | "CLEAR" | "CHEQUERED" | "BLUE" | "BLACK AND WHITE" …
  scope: string | null;        // "Track" | "Sector" | "Driver"
  sector: number | null;
  lap_number: number | null;
  driver_number: number | null;
  message: string;
  qualifying_phase?: number | null;
}

export interface SessionResultRow {
  position: number | null;     // null for DNF/DNS/DSQ
  driver_number: number;
  number_of_laps: number | null;
  points?: number | null;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
  duration?: number | null;    // race: total time (s); quali: best lap
  gap_to_leader: number | string | null;   // seconds, or "+1 LAP"
  status?: string;             // older feeds: "Finished" / "Retired" …
}

export interface StartingGridRow {
  position: number;
  driver_number: number;
  lap_duration?: number | null;
}

export interface OvertakeRow {
  date: string;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  position: number;            // position gained
}

/** Everything the engine can be given for one session. Only `session`,
 *  `drivers` and `laps` are required; what else arrived is recorded in
 *  SessionModel.coverage so analyses can gate on it explicitly. */
export interface SessionInputs {
  session: SessionInfo;
  meeting?: MeetingInfo | null;
  drivers: Driver[];
  laps: Lap[];
  stints?: Stint[] | null;
  pits?: Pit[] | null;
  intervals?: Interval[] | null;
  position?: PositionRow[] | null;
  raceControl?: RaceControlMsg[] | null;
  results?: SessionResultRow[] | null;
  weather?: Weather[] | null;
  startingGrid?: StartingGridRow[] | null;
  overtakes?: OvertakeRow[] | null;
}
