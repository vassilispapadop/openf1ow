// Every minimum-sample rule in one place. The UI shows these next to the
// sample it actually had ("n = 7 (min 5)"), so a driver never silently drops
// out of one card while appearing in the next.

export const GATES = {
  /** Clean laps a driver needs before a race-pace median is reported. */
  PACE_MIN_CLEAN: 5,
  /** Clean clear-air laps for a consistency (σ) figure. */
  CONSISTENCY_MIN: 8,
  /** Usable laps in a stint for a degradation fit. */
  DEG_MIN_LAPS: 5,
  /** Usable laps in a stint before a cliff (two-segment fit) is even tested. */
  CLIFF_MIN_LAPS: 8,
  /** Paired clean laps for a teammate comparison. */
  TEAMMATE_MIN_PAIRED: 6,
  /** Paired laps for head-to-head lap wins (same set as the teammate gap). */
  H2H_MIN_PAIRED: 6,
  /** Laps in each class (clear / dirty) for a dirty-air cost figure. */
  DIRTY_MIN_EACH: 4,
  /** Pooled clean laps for a constructor pace figure. */
  CONSTRUCTOR_MIN: 8,
  /** Clean laps with all three sectors for a sector analysis row. */
  SECTOR_MIN: 5,
  /** Consecutive clean laps for a practice long run. */
  LONGRUN_MIN: 6,
  /** Same-compound equal-tyre-age lap pairs before a fitted fuel effect is trusted. */
  FUEL_FIT_MIN_PAIRS: 12,
  /** Stints per compound for a pooled tyre-life curve. */
  TYRELIFE_MIN_STINTS: 3,
  /** Realised undercut/overcut exchanges before a window figure is shown. */
  UNDERCUT_MIN_PAIRS: 1,
  /** Pit stops for a session pit-loss estimate. */
  PITLOSS_MIN_STOPS: 4,
  /** Drivers with grid + lap-1 position for a start analysis. */
  START_MIN_DRIVERS: 10,
  /** Weather sample age beyond which a lap is not joined to it (seconds). */
  WEATHER_MAX_AGE_S: 300,
} as const;

/** Traffic thresholds (seconds to the car ahead at the start of the lap). */
export const DIRTY_AIR_THRESHOLD = 1.5;
export const DRS_RANGE_THRESHOLD = 1.0;
