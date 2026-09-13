// Pit stops: the session's one duration metric per stop, team rankings, and
// the racing figure that matters for strategy — pit loss, the time a stop
// actually costs on the stopwatch (in-lap + out-lap versus two clear laps).

import type { SessionModel, EnrichedPit } from "../types/model.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median } from "../stats.ts";
import { GATES } from "../gates.ts";

export interface TeamPitRow {
  team: string;
  color: string;
  stops: number;
  medianDuration: number;
  best: number;
  worst: number;
  underNeutralisation: number;   // stops made under SC/VSC/RED (cheap)
  vsBest: number;                // medianDuration − fastest team's median
}

export interface PitStopAnalysis {
  metric: "stationary" | "lane";
  teams: TeamPitRow[];
  /** Median time a stop costs on track: (in-lap + out-lap) − 2 × the driver's
   *  median clear lap in the stints around it. Null below the gate. */
  pitLoss: Gated<{ median: number; n: number; byStop: { pit: EnrichedPit; loss: number }[] }>;
  stops: EnrichedPit[];
}

export function pitLossFor(model: SessionModel, p: EnrichedPit): number | null {
  const d = model.byDriver[p.driver_number];
  if (!d) return null;
  const inLap = model.lapByKey[p.inLapKey];
  const outLap = model.lapByKey[p.outLapKey];
  if (!inLap?.lap_duration || !outLap?.lap_duration) return null;
  // Green-flag stops only: an SC stop is cheap for a different reason.
  if (p.underNeutralisation != null) return null;
  const before = d.stints.find(s => s.lap_end === p.lap_number);
  const after = d.stints.find(s => s.lap_start === p.lap_number + 1);
  const ref = [before?.medianClear, after?.medianClear].filter((v): v is number => v != null);
  if (!ref.length) return null;
  // Use fuel-corrected clear laps for the reference; the in/out laps are
  // corrected the same way so the fuel term cancels.
  const inC = inLap.fuelCorrected ?? inLap.lap_duration;
  const outC = outLap.fuelCorrected ?? outLap.lap_duration;
  return inC + outC - 2 * (ref.reduce((s, v) => s + v, 0) / ref.length);
}

export function pitStopAnalysis(model: SessionModel): Gated<PitStopAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const stops = model.drivers.flatMap(d => d.pits);
  if (!stops.length || !model.pitMetric) return gate("no_pits");

  const byTeam: Record<string, EnrichedPit[]> = {};
  for (const d of model.drivers) for (const p of d.pits) (byTeam[d.team] ||= []).push(p);
  const teams: TeamPitRow[] = [];
  for (const [team, ps] of Object.entries(byTeam)) {
    const durs = ps.map(p => p.duration).filter((v): v is number => v != null && v > 0);
    if (!durs.length) continue;
    teams.push({
      team, color: model.teams[team]?.color ?? "666666", stops: ps.length,
      medianDuration: median(durs), best: Math.min(...durs), worst: Math.max(...durs),
      underNeutralisation: ps.filter(p => p.underNeutralisation != null).length, vsBest: 0,
    });
  }
  teams.sort((a, b) => a.medianDuration - b.medianDuration);
  if (teams.length) for (const t of teams) t.vsBest = t.medianDuration - teams[0].medianDuration;

  const byStop = stops.map(p => ({ pit: p, loss: pitLossFor(model, p) })).filter((x): x is { pit: EnrichedPit; loss: number } => x.loss != null && Number.isFinite(x.loss));
  const pitLoss: PitStopAnalysis["pitLoss"] = byStop.length >= GATES.PITLOSS_MIN_STOPS
    ? ok({ median: median(byStop.map(x => x.loss)), n: byStop.length, byStop }, byStop.length, confidenceFromN(byStop.length, GATES.PITLOSS_MIN_STOPS))
    : gate("too_few_laps", byStop.length, GATES.PITLOSS_MIN_STOPS);

  return ok({ metric: model.pitMetric, teams, pitLoss, stops }, stops.length, teams.length >= 6 ? "high" : "medium");
}
