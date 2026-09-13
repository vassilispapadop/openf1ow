// Cumulative time delta of every driver against a reference, lap by lap —
// the race as a set of gap lines. Two sources: the sum of lap durations
// (exact while both cars are running) and, when available, the timing
// feed's gap to leader as a cross-check. Pit stops and neutralisations are
// returned as marks and bands for the chart.

import type { SessionModel } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";

export type DeltaReference = { kind: "winner" } | { kind: "leader" } | { kind: "driver"; driverNumber: number } | { kind: "teammate"; driverNumber: number };

export interface DeltaSeries {
  driver: Driver;
  team: string;
  points: { lap: number; delta: number; fromIntervals: number | null }[];   // seconds; positive = behind the reference
  pitLaps: number[];
  retiredLap: number | null;
}

export interface DeltaTrace {
  reference: { label: string; driver: Driver | null };
  series: DeltaSeries[];
  bands: { kind: "SC" | "VSC" | "RED"; fromLap: number; toLap: number }[];
  totalLaps: number;
}

function cumulative(laps: { lap_number: number; lap_duration: number | null }[]): Map<number, number> {
  const out = new Map<number, number>();
  let acc = 0;
  for (const l of [...laps].sort((a, b) => a.lap_number - b.lap_number)) {
    if (!l.lap_duration || l.lap_duration <= 0) break;   // stop at the first untimed lap (retirement / missing)
    acc += l.lap_duration;
    out.set(l.lap_number, acc);
  }
  return out;
}

export function deltaTrace(model: SessionModel, ref: DeltaReference = { kind: "winner" }): Gated<DeltaTrace> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const cum = new Map<number, Map<number, number>>();
  for (const d of model.drivers) cum.set(d.driver.driver_number, cumulative(d.laps));

  let refDriver: Driver | null = null;
  let refCum: Map<number, number> | null = null;
  let label = "";
  if (ref.kind === "leader") {
    // Per lap, the smallest cumulative time among running cars.
    refCum = new Map();
    for (let lap = 1; lap <= model.totalLaps; lap++) {
      let best = Infinity;
      for (const m of cum.values()) { const v = m.get(lap); if (v != null && v < best) best = v; }
      if (Number.isFinite(best)) refCum.set(lap, best);
    }
    label = "race leader";
  } else {
    const dn = ref.kind === "winner"
      ? model.drivers.find(d => d.classification.position === 1)?.driver.driver_number
      : ref.kind === "teammate"
        ? model.teams[model.byDriver[ref.driverNumber]?.team ?? ""]?.drivers.find(d => d.driver_number !== ref.driverNumber)?.driver_number
        : ref.driverNumber;
    if (dn == null || !model.byDriver[dn]) return gate("no_results");
    refDriver = model.byDriver[dn].driver;
    refCum = cum.get(dn) ?? null;
    label = ref.kind === "winner" ? `${refDriver.name_acronym} (winner)` : refDriver.name_acronym;
  }
  if (!refCum || !refCum.size) return gate("no_clean_laps");

  const series: DeltaSeries[] = model.drivers.map(d => {
    const mine = cum.get(d.driver.driver_number)!;
    const points: DeltaSeries["points"] = [];
    for (const [lap, t] of mine) {
      const r = refCum!.get(lap);
      if (r == null) continue;
      const next = d.laps.find(l => l.lap_number === lap + 1);
      points.push({ lap, delta: t - r, fromIntervals: next?.gapToLeader ?? null });
    }
    return { driver: d.driver, team: d.team, points, pitLaps: d.pits.map(p => p.lap_number), retiredLap: d.classification.retiredLap };
  }).filter(s => s.points.length >= 2);
  if (!series.length) return gate("no_clean_laps");

  return ok({
    reference: { label, driver: refDriver },
    series,
    bands: model.neutralisations.filter(n => n.kind !== "YELLOW").map(n => ({ kind: n.kind as "SC" | "VSC" | "RED", fromLap: n.lapStart, toLap: n.lapEnd })),
    totalLaps: model.totalLaps,
  }, series.length, "high");
}
