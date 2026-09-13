// Every analysis returns a Gated<T>: either a value with its sample size and
// a confidence, or an explicit reason it could not be computed. There is no
// third option — no card may render a 0 that means "no data".

export type GateReason =
  | "no_data"            // the input the analysis needs was not provided at all
  | "too_few_laps"       // below the minimum sample in GATES
  | "no_clean_laps"
  | "no_intervals"       // traffic/gap analyses need /intervals; never fall back to timestamps
  | "no_race_control"
  | "no_stints"
  | "no_pits"
  | "no_results"
  | "no_grid"
  | "wrong_session_kind" // e.g. race-pace analysis on a qualifying session
  | "retired_early"
  | "fit_unstable"       // regression had no variance or diverged from the robust estimate
  | "weather_stale"
  | "single_driver_team"
  | "no_telemetry";

export type Confidence = "high" | "medium" | "low";

export type Gated<T> =
  | { ok: true; value: T; n: number; confidence: Confidence; notes?: string[] }
  | { ok: false; reason: GateReason; n: number; need: number };

export function ok<T>(value: T, n: number, confidence: Confidence, notes?: string[]): Gated<T> {
  return notes?.length ? { ok: true, value, n, confidence, notes } : { ok: true, value, n, confidence };
}

export function gate<T = never>(reason: GateReason, n = 0, need = 0): Gated<T> {
  return { ok: false, reason, n, need };
}

/** Map a Gated value without touching its gate/confidence. */
export function mapGated<A, B>(g: Gated<A>, f: (a: A) => B): Gated<B> {
  return g.ok ? { ...g, value: f(g.value) } : g;
}

/** Confidence from a sample size against a gate's minimum: at the minimum it
 *  is low, at roughly 1.6× medium, at 3× high. Callers may downgrade further. */
export function confidenceFromN(n: number, need: number): Confidence {
  if (n >= need * 3) return "high";
  if (n >= Math.ceil(need * 1.6)) return "medium";
  return "low";
}

export function downgrade(c: Confidence): Confidence {
  return c === "high" ? "medium" : "low";
}

/** Human-readable gate text for the UI ("needs 5 clean laps, has 3"). */
export function describeGate(g: { reason: GateReason; n: number; need: number }): string {
  switch (g.reason) {
    case "too_few_laps": return `needs ${g.need} usable laps, has ${g.n}`;
    case "no_clean_laps": return "no clean laps to work from";
    case "no_intervals": return "timing intervals not available for this session";
    case "no_race_control": return "race-control messages not available";
    case "no_stints": return "stint data not available";
    case "no_pits": return "pit-stop data not available";
    case "no_results": return "classification not available";
    case "no_grid": return "starting grid not available";
    case "wrong_session_kind": return "not applicable to this kind of session";
    case "retired_early": return "retired before enough laps were run";
    case "fit_unstable": return "the fit is not stable enough to report";
    case "weather_stale": return "weather samples too far from the laps";
    case "single_driver_team": return "only one driver with data on this team";
    case "no_telemetry": return "car telemetry not available";
    case "no_data":
    default: return "no data";
  }
}

/** Least-squares fit with the diagnostics a card needs to say how much to
 *  trust the slope. `robustSlope` (Theil–Sen) is the cross-check: when it and
 *  the OLS slope disagree by more than the slope's standard error, the
 *  confidence is downgraded. */
export interface Fit {
  slope: number;
  intercept: number;
  r2: number;
  se: number;                  // standard error of the slope
  ci95: [number, number];
  n: number;
  residualStd: number;
  robustSlope: number;
}
