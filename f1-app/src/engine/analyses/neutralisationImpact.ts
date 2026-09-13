// Who gained and lost under each safety car, VSC or red flag: gap to the
// leader before the window versus on the first green lap after it, plus the
// "cheap stop" credit for cars that pitted under it.

import type { SessionModel, Neutralisation } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { pitStopAnalysis } from "./pitstops.ts";

export interface ImpactRow {
  driver: Driver;
  team: string;
  gapBefore: number | null;        // gap to leader at the last green lap before
  gapAfter: number | null;         // gap to leader at the first green lap after
  delta: number | null;            // gapAfter − gapBefore, relative to the field's median change (negative = gained on the field)
  rawDelta: number | null;         // gapAfter − gapBefore as measured (everyone closes on the leader under a SC)
  positionsGained: number | null;  // positionBefore − positionAfter
  positionBefore: number | null;
  positionAfter: number | null;
  pittedUnder: boolean;
  cheapStopCredit: number | null;  // normal pit loss − realised loss, when pitted under
}

export interface NeutralisationImpact {
  window: Neutralisation;
  index: number;
  lapBefore: number;
  lapAfter: number;
  rows: ImpactRow[];               // by delta, biggest gain first
  winners: ImpactRow[];            // top 3 gainers
  losers: ImpactRow[];
}

export function neutralisationImpact(model: SessionModel): Gated<NeutralisationImpact[]> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.raceControl) return gate("no_race_control");
  if (!model.coverage.intervals) return gate("no_intervals");
  const windows = model.neutralisations.filter(n => n.kind !== "YELLOW");
  if (!windows.length) return ok([], 0, "high", ["No safety car, VSC or red flag in this race."]);

  const pits = pitStopAnalysis(model);
  const normalLoss = pits.ok && pits.value.pitLoss.ok ? pits.value.pitLoss.value.median : null;

  const out: NeutralisationImpact[] = windows.map((w, index) => {
    const lapBefore = Math.max(1, w.lapStart - 1);
    const lapAfter = w.lapEnd + 1;
    const rows: ImpactRow[] = model.drivers.map(d => {
      const lb = d.laps.find(l => l.lap_number === lapBefore);
      const la = d.laps.find(l => l.lap_number === lapAfter);
      const pittedUnder = d.pits.some(p => p.underNeutralisation === model.neutralisations.indexOf(w));
      const gapBefore = lb?.gapToLeader ?? null, gapAfter = la?.gapToLeader ?? null;
      const rawDelta = gapBefore != null && gapAfter != null ? gapAfter - gapBefore : null;
      const pb = lb?.position ?? null, pa = la?.position ?? null;
      return { driver: d.driver, team: d.team, gapBefore, gapAfter, delta: null as number | null, rawDelta, positionBefore: pb, positionAfter: pa,
        positionsGained: pb != null && pa != null ? pb - pa : null, pittedUnder, cheapStopCredit: null as number | null };
    }).filter(r => r.rawDelta != null);
    // Under a safety car the whole field closes on the leader; what matters is
    // the change relative to the field, so subtract the median change.
    const raw = rows.map(r => r.rawDelta as number).sort((a, b) => a - b);
    const fieldShift = raw.length ? raw[raw.length >> 1] : 0;
    for (const r of rows) {
      r.delta = (r.rawDelta as number) - fieldShift;
      // Realised cost of an SC stop ≈ the relative gap movement; credit = normal − realised.
      r.cheapStopCredit = r.pittedUnder && normalLoss != null ? normalLoss - Math.max(0, r.delta) : null;
    }
    rows.sort((a, b) => (a.delta as number) - (b.delta as number));
    return { window: w, index, lapBefore, lapAfter, rows, winners: rows.slice(0, 3), losers: rows.slice(-3).reverse() };
  });
  return ok(out, windows.length, "medium");
}
