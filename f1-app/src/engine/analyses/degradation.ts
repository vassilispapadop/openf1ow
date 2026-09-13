// Degradation summaries over the per-stint fits the model already carries.

import type { SessionModel, EnrichedStint } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median } from "../stats.ts";
import { GATES } from "../gates.ts";

export const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"];

export function compoundRank(c: string): number {
  const i = COMPOUND_ORDER.indexOf(c);
  return i < 0 ? COMPOUND_ORDER.length : i;
}

export interface CompoundSummary {
  compound: string;
  medianDeg: number;           // sec/lap, fuel-corrected, negative allowed
  degIqr: [number, number];
  medianPace: number | null;   // median clear-air fuel-corrected time across stints
  medianStintLength: number;   // laps
  stints: number;              // with a usable fit
  stintsSeen: number;          // all stints on the compound
  cliffs: number;              // stints where a cliff was detected
}

export function compoundSummary(model: SessionModel): Gated<CompoundSummary[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.stints) return gate("no_stints");
  const by: Record<string, EnrichedStint[]> = {};
  for (const d of model.drivers) for (const s of d.stints) (by[s.compound] ||= []).push(s);
  const out: CompoundSummary[] = [];
  for (const [compound, stints] of Object.entries(by)) {
    const fitted = stints.filter(s => s.deg.ok);
    if (!fitted.length) continue;
    const slopes = fitted.map(s => (s.deg.ok ? s.deg.value.slope : 0)).sort((a, b) => a - b);
    const paces = fitted.map(s => s.medianClear).filter((v): v is number => v != null);
    out.push({
      compound,
      medianDeg: median(slopes),
      degIqr: [slopes[Math.floor(slopes.length * 0.25)], slopes[Math.floor(slopes.length * 0.75)]],
      medianPace: paces.length ? median(paces) : null,
      medianStintLength: median(stints.map(s => s.lengthLaps)),
      stints: fitted.length,
      stintsSeen: stints.length,
      cliffs: fitted.filter(s => s.cliff.ok).length,
    });
  }
  if (!out.length) return gate("too_few_laps", 0, GATES.DEG_MIN_LAPS);
  out.sort((a, b) => compoundRank(a.compound) - compoundRank(b.compound));
  return ok(out, out.reduce((s, c) => s + c.stints, 0), "medium");
}

export interface DriverDegRow {
  driver: Driver;
  team: string;
  weightedDeg: number;         // lap-weighted mean slope over fitted stints
  stints: number;
  fitLaps: number;
  compounds: string[];
  bestStint: EnrichedStint | null;   // lowest slope
}

/** Per-driver tyre management: lap-weighted mean of stint slopes. */
export function driverDegradation(model: SessionModel): Gated<DriverDegRow[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const rows: DriverDegRow[] = [];
  for (const d of model.drivers) {
    const fitted = d.stints.filter(s => s.deg.ok);
    const n = fitted.reduce((s, st) => s + st.deg.n, 0);
    if (n < GATES.CLIFF_MIN_LAPS) continue;
    const weighted = fitted.reduce((s, st) => s + (st.deg.ok ? st.deg.value.slope : 0) * st.deg.n, 0) / n;
    const best = fitted.reduce<EnrichedStint | null>((m, st) =>
      !m || (st.deg.ok && m.deg.ok && st.deg.value.slope < m.deg.value.slope) ? st : m, null);
    rows.push({
      driver: d.driver, team: d.team, weightedDeg: weighted, stints: fitted.length, fitLaps: n,
      compounds: [...new Set(fitted.map(s => s.compound))], bestStint: best,
    });
  }
  if (!rows.length) return gate("too_few_laps", 0, GATES.CLIFF_MIN_LAPS);
  rows.sort((a, b) => a.weightedDeg - b.weightedDeg);
  return ok(rows, rows.length, confidenceFromN(rows.length, 6));
}
