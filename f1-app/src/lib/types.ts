export interface Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
}

export interface Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  date_start: string;
  st_speed: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
}

export interface Stint {
  driver_number: number;
  stint_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  tyre_age_at_start: number;
}

export interface Pit {
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  stop_duration: number | null;
  lane_duration: number | null;
  date: string;
}

export interface Weather {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: boolean;
  wind_speed: number;
  wind_direction: number | null;
}
