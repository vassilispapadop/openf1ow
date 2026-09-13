// Tyre life per compound, pooled across the field. Each stint's fitted
// intercept is removed so residuals measure the tyre, not the car; residuals
// are binned by tyre age. The curve, the pooled slope, a p90 stint length
// and a cliff age (where the binned median jumps) fall out.

import type { SessionModel, EnrichedStint } from "../types/model.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median, quantile, olsFit } from "../stats.ts";
import { GATES } from "../gates.ts";
import { compoundRank } from "./degradation.ts";

export interface TyreLifeBin { age: number; median: number; iqr: [number, number]; n: number; stints: number }

export interface TyreLifeCurve {
  compound: string;
  bins: TyreLifeBin[];           // residual (s) vs tyre age, ≥ 3 stints per bin
  pooledSlope: number | null;    // s/lap, n-weighted OLS over all fit laps' residuals
  stints: number;
  p90StintLength: number;
  cliffAge: number | null;       // first age where the median rises > 0.3 s over the prior two bins
}

const CLIFF_JUMP_S = 0.3;

export function tyreLife(model: SessionModel): Gated<TyreLifeCurve[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.stints) return gate("no_stints");
  const byC: Record<string, EnrichedStint[]> = {};
  for (const d of model.drivers) for (const s of d.stints) if (s.deg.ok) (byC[s.compound] ||= []).push(s);
  const out: TyreLifeCurve[] = [];
  for (const [compound, stints] of Object.entries(byC)) {
    if (stints.length < GATES.TYRELIFE_MIN_STINTS) continue;
    const byAge: Record<number, { r: number; sid: string }[]> = {};
    const xs: number[] = [], ys: number[] = [];
    for (const s of stints) {
      const fit = s.deg.ok ? s.deg.value : null;
      if (!fit) continue;
      for (const l of s.fitLaps) {
        const r = (l.fuelCorrected as number) - fit.intercept;
        (byAge[l.tyreAge as number] ||= []).push({ r, sid: `${s.driver_number}-${s.stint_number}` });
        xs.push(l.tyreAge as number); ys.push(r);
      }
    }
    const bins: TyreLifeBin[] = Object.entries(byAge)
      .map(([age, rs]) => ({ age: Number(age), rs }))
      .filter(b => new Set(b.rs.map(x => x.sid)).size >= GATES.TYRELIFE_MIN_STINTS)
      .sort((a, b) => a.age - b.age)
      .map(b => {
        const v = b.rs.map(x => x.r);
        return { age: b.age, median: median(v), iqr: [quantile(v, 0.25), quantile(v, 0.75)] as [number, number], n: v.length, stints: new Set(b.rs.map(x => x.sid)).size };
      });
    let cliffAge: number | null = null;
    for (let i = 2; i < bins.length; i++) {
      const prior = (bins[i - 1].median + bins[i - 2].median) / 2;
      if (bins[i].median - prior > CLIFF_JUMP_S) { cliffAge = bins[i].age; break; }
    }
    const fit = olsFit(xs, ys);
    out.push({
      compound, bins, pooledSlope: fit ? fit.slope : null, stints: stints.length,
      p90StintLength: quantile(stints.map(s => s.lengthLaps), 0.9), cliffAge,
    });
  }
  if (!out.length) return gate("too_few_laps", 0, GATES.TYRELIFE_MIN_STINTS);
  out.sort((a, b) => compoundRank(a.compound) - compoundRank(b.compound));
  return ok(out, out.reduce((s, c) => s + c.stints, 0), confidenceFromN(out.reduce((s, c) => s + c.stints, 0), 6));
}
