// The race as a strategy timeline: every driver's stints as compound spans,
// pit marks with their cost, neutralisation bands, and where each car
// stopped running. View-ready; no maths beyond what the model already has.

import type { SessionModel, EnrichedPit } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { pitLossFor } from "./pitstops.ts";

export interface StintSpan { fromLap: number; toLap: number; compound: string; tyreAgeAtStart: number; degSlope: number | null; degOk: boolean; cliffAt: number | null }
export interface PitMark { lap: number; duration: number | null; loss: number | null; underNeutralisation: boolean; pit: EnrichedPit }

export interface TimelineRow {
  driver: Driver;
  team: string;
  finish: number | null;
  status: string;
  retiredLap: number | null;
  stints: StintSpan[];
  pits: PitMark[];
  stops: number;
}

export interface StrategyTimeline {
  totalLaps: number;
  rows: TimelineRow[];            // by finishing position, retirements last
  bands: { kind: "SC" | "VSC" | "RED"; fromLap: number; toLap: number }[];
  strategies: { label: string; count: number; drivers: string[] }[];   // "M→H", "S→M→H" …
}

const SHORT: Record<string, string> = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?" };

export function strategyTimeline(model: SessionModel): Gated<StrategyTimeline> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  if (!model.coverage.stints) return gate("no_stints");
  const rows: TimelineRow[] = model.drivers.map(d => ({
    driver: d.driver,
    team: d.team,
    finish: d.classification.position,
    status: d.classification.status,
    retiredLap: d.classification.retiredLap,
    stints: d.stints.map(s => ({
      fromLap: s.lap_start, toLap: s.lap_end, compound: s.compound, tyreAgeAtStart: s.tyre_age_at_start,
      degSlope: s.deg.ok ? s.deg.value.slope : null, degOk: s.deg.ok, cliffAt: s.cliff.ok ? s.cliff.value.atTyreAge : null,
    })),
    pits: d.pits.map(p => ({ lap: p.lap_number, duration: p.duration, loss: pitLossFor(model, p), underNeutralisation: p.underNeutralisation != null, pit: p })),
    stops: d.pits.length,
  }));
  rows.sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99) || (b.retiredLap ?? 0) - (a.retiredLap ?? 0));

  const bands = model.neutralisations.filter(n => n.kind !== "YELLOW").map(n => ({ kind: n.kind as "SC" | "VSC" | "RED", fromLap: n.lapStart, toLap: n.lapEnd }));

  const byLabel: Record<string, string[]> = {};
  for (const r of rows) {
    if (r.status !== "finished") continue;
    const label = r.stints.map(s => SHORT[s.compound] ?? "?").join("→");
    (byLabel[label] ||= []).push(r.driver.name_acronym);
  }
  const strategies = Object.entries(byLabel).map(([label, ds]) => ({ label, count: ds.length, drivers: ds })).sort((a, b) => b.count - a.count);

  return ok({ totalLaps: model.totalLaps, rows, bands, strategies }, rows.length, "high");
}
