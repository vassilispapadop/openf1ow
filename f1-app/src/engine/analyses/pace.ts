// Race pace: the median of a driver's clean laps, and the "true" version
// normalised for tyre age so a driver who ran long on old rubber is not
// punished for it. Both carry a bootstrap interval on the median.

import type { SessionModel, DriverSummary, EnrichedLap } from "../types/model.ts";
import { type Gated, ok, gate, confidenceFromN, downgrade } from "../types/gated.ts";
import { median, sampleStd, bootstrapMedianCI } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface PaceRow {
  driver: DriverSummary["driver"];
  team: string;
  medianPace: number;        // sec (fuel-corrected to race-end fuel)
  medianRaw: number;         // sec, raw lap durations — the number people expect to see
  bestLap: number;           // sec, raw
  ci95: [number, number];    // on medianPace
  consistency: number;       // sample σ of the laps used
  n: number;
  gapToFastest: number;      // sec, on medianPace
}

export interface PaceRanking {
  rows: Gated<PaceRow>[];    // one per driver with any laps, gated individually
  ranked: PaceRow[];         // the ok rows, fastest first
  reference: number | null;  // fastest medianPace
}

function rowFor(d: DriverSummary, laps: EnrichedLap[], values: (l: EnrichedLap) => number, need: number): Gated<PaceRow> {
  if (!laps.length) return gate("no_clean_laps", 0, need);
  if (laps.length < need) return gate("too_few_laps", laps.length, need);
  const ys = laps.map(values);
  const raw = laps.map(l => l.lap_duration as number);
  const ci = bootstrapMedianCI(ys);
  let conf = confidenceFromN(laps.length, need);
  if (ci[1] - ci[0] > 0.3) conf = downgrade(conf);
  return ok({
    driver: d.driver,
    team: d.team,
    medianPace: median(ys),
    medianRaw: median(raw),
    bestLap: Math.min(...raw),
    ci95: ci,
    consistency: sampleStd(ys),
    n: laps.length,
    gapToFastest: 0,
  }, laps.length, conf);
}

function finish(rows: Gated<PaceRow>[]): PaceRanking {
  const okRows = rows.filter((r): r is Extract<Gated<PaceRow>, { ok: true }> => r.ok).map(r => r.value);
  okRows.sort((a, b) => a.medianPace - b.medianPace);
  const reference = okRows.length ? okRows[0].medianPace : null;
  if (reference != null) for (const r of okRows) r.gapToFastest = r.medianPace - reference;
  return { rows, ranked: okRows, reference };
}

/** Median fuel-corrected clean-lap pace per driver. */
export function paceRanking(model: SessionModel): Gated<PaceRanking> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const rows = model.drivers.map(d => rowFor(d, d.laps.filter(l => l.clean), l => l.fuelCorrected as number, GATES.PACE_MIN_CLEAN));
  const result = finish(rows);
  if (!result.ranked.length) return gate("no_clean_laps", 0, GATES.PACE_MIN_CLEAN);
  return ok(result, result.ranked.length, result.ranked.length >= 12 ? "high" : "medium");
}

/** Pace normalised for fuel AND tyre age (to age 10 using each stint's own
 *  fitted slope), on clear-air laps only. Laps in stints without a usable fit
 *  fall back to the compound's pooled slope across the field; laps with
 *  neither are skipped. */
export function truePaceRanking(model: SessionModel): Gated<PaceRanking> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const REF_AGE = 10;

  // Pooled slope per compound from stints with a usable fit, weighted by n.
  const pooled: Record<string, { num: number; den: number }> = {};
  for (const d of model.drivers) for (const s of d.stints) {
    if (!s.deg.ok) continue;
    const p = (pooled[s.compound] ||= { num: 0, den: 0 });
    p.num += s.deg.value.slope * s.deg.n;
    p.den += s.deg.n;
  }
  const pooledSlope = (c: string | null) => (c && pooled[c]?.den ? pooled[c].num / pooled[c].den : null);

  const rows = model.drivers.map(d => {
    const usable: EnrichedLap[] = [];
    const adjusted = new Map<EnrichedLap, number>();
    for (const l of d.laps) {
      if (!l.clearAir || l.tyreAge == null || l.fuelCorrected == null) continue;
      const st = d.stints.find(s => s.stint_number === l.stintNumber);
      const slope = st?.deg.ok ? st.deg.value.slope : pooledSlope(l.compound);
      if (slope == null) continue;
      adjusted.set(l, l.fuelCorrected - slope * (l.tyreAge - REF_AGE));
      usable.push(l);
    }
    return rowFor(d, usable, l => adjusted.get(l) as number, GATES.PACE_MIN_CLEAN);
  });
  const result = finish(rows);
  if (!result.ranked.length) return gate("no_clean_laps", 0, GATES.PACE_MIN_CLEAN);
  return ok(result, result.ranked.length, result.ranked.length >= 12 ? "high" : "medium",
    ["Normalised to tyre age 10 with each stint's fitted degradation; fuel corrected to race-end load."]);
}
