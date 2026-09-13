// The start: grid to the end of lap 1, and to the end of the opening phase
// (lap 5). Lap 1 is analysed here — it is excluded from pace everywhere
// else, not thrown away.

import type { SessionModel } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface StartRow {
  driver: Driver;
  team: string;
  grid: number | null;
  afterLap1: number | null;       // position at the start of lap 2 (= end of lap 1)
  afterLap5: number | null;
  gainedLap1: number | null;      // grid − afterLap1 (positive = places gained)
  gainedPhase: number | null;     // grid − afterLap5
  lap1Time: number | null;
  lap1VsField: number | null;     // lap-1 time − field median lap-1 time
  pitLaneStart: boolean;
}

export interface StartAnalysis {
  rows: StartRow[];               // by places gained on lap 1, best first
  gridSource: string | null;
  fieldLap1Median: number | null;
  incidents: { lap: number | null; message: string }[];   // race-control messages on laps 1–2
  bestStart: StartRow | null;
  worstStart: StartRow | null;
}

export function startAnalysis(model: SessionModel): Gated<StartAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const rows: StartRow[] = [];
  const lap1Times: number[] = [];
  for (const d of model.drivers) {
    const l1 = d.laps.find(l => l.lap_number === 1);
    const l2 = d.laps.find(l => l.lap_number === 2);
    const l6 = d.laps.find(l => l.lap_number === 6);
    const grid = d.gridPosition;
    const after1 = l2?.position ?? null;
    const after5 = l6?.position ?? null;
    const t1 = l1?.lap_duration ?? null;
    if (t1) lap1Times.push(t1);
    rows.push({
      driver: d.driver, team: d.team, grid,
      afterLap1: after1, afterLap5: after5,
      gainedLap1: grid != null && after1 != null ? grid - after1 : null,
      gainedPhase: grid != null && after5 != null ? grid - after5 : null,
      lap1Time: t1, lap1VsField: null,
      pitLaneStart: grid == null && d.classification.status !== "dns",
    });
  }
  const withGrid = rows.filter(r => r.grid != null && r.afterLap1 != null);
  if (withGrid.length < GATES.START_MIN_DRIVERS) return gate(model.drivers.some(d => d.gridPosition != null) ? "too_few_laps" : "no_grid", withGrid.length, GATES.START_MIN_DRIVERS);
  const fieldLap1Median = lap1Times.length ? median(lap1Times) : null;
  for (const r of rows) if (r.lap1Time != null && fieldLap1Median != null) r.lap1VsField = r.lap1Time - fieldLap1Median;
  rows.sort((a, b) => (b.gainedLap1 ?? -99) - (a.gainedLap1 ?? -99));
  const incidents = (model.neutralisations.flatMap(n => n.messages))
    .concat([])
    .filter(m => (m.lap_number ?? 99) <= 2)
    .map(m => ({ lap: m.lap_number, message: m.message }));
  const gridSource = model.drivers.find(d => d.gridSource)?.gridSource ?? null;
  return ok({
    rows, gridSource, fieldLap1Median, incidents,
    bestStart: withGrid.length ? rows[0] : null,
    worstStart: withGrid.length ? [...rows].reverse().find(r => r.gainedLap1 != null) ?? null : null,
  }, withGrid.length, gridSource === "starting_grid" ? confidenceFromN(withGrid.length, GATES.START_MIN_DRIVERS) : "low",
  gridSource === "first_position" ? ["Grid taken from the position feed before the start — the official grid was not published."] : undefined);
}
