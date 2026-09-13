// What following a car costs, from real gaps. Baseline per stint is the
// median fuel-corrected clear-air lap — never including the dirty laps being
// measured. Losses are signed; a lap in traffic that was not slower says so.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { LapFlag, hasFlag } from "../types/model.ts";
import { median } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface DirtyLap { lap: EnrichedLap; loss: number; carAhead: Driver | null }

export interface DriverTraffic {
  driver: Driver;
  team: string;
  racingLaps: number;             // clean laps (any traffic state)
  clearLaps: number;
  dirtyLaps: number;
  clearShare: number;             // clearLaps / racingLaps
  medianLoss: number | null;      // median signed loss on dirty laps vs the stint's clear-air median
  totalLoss: number | null;       // sum of positive losses
  worstTrain: { behind: Driver | null; laps: number; loss: number } | null;
  dirty: DirtyLap[];
}

export interface DirtyAirAnalysis {
  drivers: DriverTraffic[];          // by medianLoss desc among those with enough laps
  costByGap: { bin: string; from: number; to: number; medianLoss: number; n: number }[];
  mostAffected: DriverTraffic | null;
  leastAffected: DriverTraffic | null;
}

const GAP_BINS: [number, number][] = [[0, 0.5], [0.5, 1.0], [1.0, 1.5]];

export function dirtyAirAnalysis(model: SessionModel): Gated<DirtyAirAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.intervals) return gate("no_intervals");

  const all: { gap: number; loss: number }[] = [];
  const drivers: DriverTraffic[] = [];
  for (const d of model.drivers) {
    const racing = d.laps.filter(l => l.clean);
    const clear = racing.filter(l => l.clearAir);
    const dirty: DirtyLap[] = [];
    for (const l of racing) {
      if (!hasFlag(l.flags, LapFlag.DIRTY) || l.fuelCorrected == null) continue;
      const st = d.stints.find(s => s.stint_number === l.stintNumber);
      if (!st?.medianClear) continue;
      const loss = l.fuelCorrected - st.medianClear;
      dirty.push({ lap: l, loss, carAhead: l.carAhead != null ? model.byDriver[l.carAhead]?.driver ?? null : null });
      if (l.gapAhead != null) all.push({ gap: l.gapAhead, loss });
    }
    // Longest run of consecutive dirty laps behind the same car.
    let worst: DriverTraffic["worstTrain"] = null;
    let run: DirtyLap[] = [];
    const flush = () => {
      if (run.length >= 3) {
        const loss = run.reduce((s, x) => s + Math.max(0, x.loss), 0);
        if (!worst || run.length > worst.laps) worst = { behind: run[0].carAhead, laps: run.length, loss };
      }
      run = [];
    };
    for (let i = 0; i < dirty.length; i++) {
      const prev = dirty[i - 1];
      if (prev && dirty[i].lap.lap_number === prev.lap.lap_number + 1 && dirty[i].lap.carAhead === prev.lap.carAhead) run.push(dirty[i]);
      else { flush(); run = [dirty[i]]; }
    }
    flush();
    const enough = clear.length >= GATES.DIRTY_MIN_EACH && dirty.length >= GATES.DIRTY_MIN_EACH;
    drivers.push({
      driver: d.driver, team: d.team,
      racingLaps: racing.length, clearLaps: clear.length, dirtyLaps: dirty.length,
      clearShare: racing.length ? clear.length / racing.length : 0,
      medianLoss: enough ? median(dirty.map(x => x.loss)) : null,
      totalLoss: dirty.length ? dirty.reduce((s, x) => s + Math.max(0, x.loss), 0) : null,
      worstTrain: worst, dirty,
    });
  }
  const measured = drivers.filter(d => d.medianLoss != null);
  if (!measured.length) return gate("too_few_laps", 0, GATES.DIRTY_MIN_EACH);
  measured.sort((a, b) => (b.medianLoss as number) - (a.medianLoss as number));

  const costByGap = GAP_BINS.map(([from, to]) => {
    const v = all.filter(x => x.gap >= from && x.gap < to).map(x => x.loss);
    return { bin: `${from.toFixed(1)}–${to.toFixed(1)} s`, from, to, medianLoss: v.length ? median(v) : NaN, n: v.length };
  }).filter(b => b.n >= GATES.DIRTY_MIN_EACH);

  return ok({
    drivers: drivers.sort((a, b) => (b.medianLoss ?? -Infinity) - (a.medianLoss ?? -Infinity)),
    costByGap,
    mostAffected: measured[0] ?? null,
    leastAffected: measured[measured.length - 1] ?? null,
  }, measured.length, confidenceFromN(measured.length, 6));
}
