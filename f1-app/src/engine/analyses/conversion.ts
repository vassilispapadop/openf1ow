// Grid → finish, and pace rank → finish: who converted, who under-delivered.

import type { SessionModel } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { paceRanking } from "./pace.ts";

export interface ConversionRow {
  driver: Driver;
  team: string;
  grid: number | null;
  finish: number | null;
  status: string;
  gridToFinish: number | null;      // grid − finish (positive = gained)
  paceRank: number | null;
  paceToFinish: number | null;      // paceRank − finish (positive = finished better than the pace)
}

export interface ConversionAnalysis {
  rows: ConversionRow[];             // by finish
  biggestGain: ConversionRow | null;
  biggestLoss: ConversionRow | null;
  overperformer: ConversionRow | null;   // largest paceToFinish among finishers
  underperformer: ConversionRow | null;
}

export function conversionAnalysis(model: SessionModel): Gated<ConversionAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.results) return gate("no_results");
  const pace = paceRanking(model);
  const rankOf: Record<number, number> = {};
  if (pace.ok) pace.value.ranked.forEach((r, i) => { rankOf[r.driver.driver_number] = i + 1; });
  const rows: ConversionRow[] = model.drivers.map(d => {
    const grid = d.gridPosition, finish = d.classification.position;
    const pr = rankOf[d.driver.driver_number] ?? null;
    return {
      driver: d.driver, team: d.team, grid, finish, status: d.classification.status,
      gridToFinish: grid != null && finish != null ? grid - finish : null,
      paceRank: pr,
      paceToFinish: pr != null && finish != null ? pr - finish : null,
    };
  }).sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99));
  const finished = rows.filter(r => r.status === "finished");
  const by = <K extends keyof ConversionRow>(k: K, dir: 1 | -1) =>
    finished.filter(r => r[k] != null).sort((a, b) => dir * ((b[k] as number) - (a[k] as number)))[0] ?? null;
  return ok({
    rows,
    biggestGain: by("gridToFinish", 1), biggestLoss: by("gridToFinish", -1),
    overperformer: by("paceToFinish", 1), underperformer: by("paceToFinish", -1),
  }, finished.length, confidenceFromN(finished.length, 10));
}
