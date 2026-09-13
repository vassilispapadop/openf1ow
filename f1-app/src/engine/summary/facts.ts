// The structured facts of a session: verdicts plus compact tables. This is
// what the LLM narrative is prompted with and what "Export JSON" downloads,
// so the prose, the export, the recap and the cards quote one set of numbers.

import type { SessionModel } from "../types/model.ts";
import { generateVerdicts, type Verdict } from "../verdicts/index.ts";
import { paceRanking, truePaceRanking } from "../analyses/pace.ts";
import { constructorPace } from "../analyses/constructors.ts";
import { teammateComparisons } from "../analyses/teammates.ts";
import { compoundSummary } from "../analyses/degradation.ts";
import { pitStopAnalysis } from "../analyses/pitstops.ts";
import { undercutAnalysis } from "../analyses/undercut.ts";
import { startAnalysis } from "../analyses/start.ts";
import { overtakeAnalysis } from "../analyses/overtakes.ts";
import { topSpeeds } from "../analyses/speeds.ts";
import { sectorAnalysis } from "../analyses/sectors.ts";
import { dirtyAirAnalysis } from "../analyses/dirtyAir.ts";
import { neutralisationImpact } from "../analyses/neutralisationImpact.ts";

const r3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

export interface AnalysisFacts {
  schemaVersion: 1;
  engine: string;
  session: { key: number; name: string; type: string; meeting: string | null; circuit: string | null; year: number | null; sprint: boolean; totalLaps: number };
  coverage: SessionModel["coverage"];
  warnings: string[];
  fuel: SessionModel["fuel"];
  verdicts: Verdict[];
  tables: Record<string, unknown>;
}

export function buildFacts(model: SessionModel): AnalysisFacts {
  const verdicts = generateVerdicts(model);
  const tables: Record<string, unknown> = {};

  tables.results = model.drivers
    .slice().sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99))
    .map(d => ({ pos: d.classification.position, driver: d.driver.name_acronym, team: d.team, grid: d.gridPosition, status: d.classification.status, laps: d.classification.lapsCompleted, gap: d.classification.gapToLeader, stops: d.pits.length, strategy: d.stints.map(s => s.compound[0]).join("→") }));

  const pace = paceRanking(model);
  if (pace.ok) tables.pace = pace.value.ranked.map((r, i) => ({ rank: i + 1, driver: r.driver.name_acronym, team: r.team, median: r3(r.medianRaw), fuelCorrected: r3(r.medianPace), gap: r3(r.gapToFastest), ci: [r3(r.ci95[0]), r3(r.ci95[1])], sigma: r3(r.consistency), n: r.n }));
  const tp = truePaceRanking(model);
  if (tp.ok) tables.truePace = tp.value.ranked.slice(0, 12).map((r, i) => ({ rank: i + 1, driver: r.driver.name_acronym, gap: r3(r.gapToFastest), n: r.n }));
  const cp = constructorPace(model);
  if (cp.ok) tables.constructors = cp.value.map(t => ({ team: t.team, median: r3(t.medianPace), gap: r3(t.gapToFastest), intraTeamGap: r3(t.intraTeamGap), n: t.n }));
  const tm = teammateComparisons(model);
  if (tm.ok) tables.teammates = tm.value.map(t => ({ team: t.team, faster: t.primary.faster.name_acronym, slower: t.primary.slower.name_acronym, gap: r3(t.primary.gap), ci: [r3(t.primary.ci95[0]), r3(t.primary.ci95[1])], p: r3(t.primary.pValue), n: t.primary.n, significant: t.primary.significant }));
  const cs = compoundSummary(model);
  if (cs.ok) tables.compounds = cs.value.map(c => ({ compound: c.compound, degPerLap: r3(c.medianDeg), medianPace: r3(c.medianPace), medianStint: c.medianStintLength, stints: c.stints, cliffs: c.cliffs }));
  const ps = pitStopAnalysis(model);
  if (ps.ok) tables.pitStops = { metric: ps.value.metric, pitLoss: ps.value.pitLoss.ok ? r3(ps.value.pitLoss.value.median) : null, teams: ps.value.teams.map(t => ({ team: t.team, stops: t.stops, median: r3(t.medianDuration), best: r3(t.best), underSC: t.underNeutralisation })) };
  const uc = undercutAnalysis(model);
  if (uc.ok) tables.undercuts = uc.value.exchanges.map(e => ({ first: e.first.name_acronym, second: e.second.name_acronym, lapFirst: e.firstStopLap, lapSecond: e.secondStopLap, gapBefore: r3(e.gapBefore), gapAfter: r3(e.gapAfter), swing: r3(e.delta), result: e.delta < 0 ? "undercut won" : "overcut won" }));
  const st = startAnalysis(model);
  if (st.ok) tables.start = st.value.rows.filter(r => r.grid != null).map(r => ({ driver: r.driver.name_acronym, grid: r.grid, afterLap1: r.afterLap1, afterLap5: r.afterLap5, lap1VsField: r3(r.lap1VsField) }));
  const ov = overtakeAnalysis(model);
  if (ov.ok) tables.overtakes = { totals: ov.value.totals, source: ov.value.source, byDriver: ov.value.byDriver.filter(d => d.made || d.suffered).map(d => ({ driver: d.driver.name_acronym, onTrackMade: d.onTrackMade, onTrackSuffered: d.onTrackSuffered, net: d.net })) };
  const se = sectorAnalysis(model);
  const ts = topSpeeds(model);
  if (ts.ok) tables.topSpeeds = { fieldBest: ts.value.fieldBest.trap ? { driver: ts.value.fieldBest.trap.driver.name_acronym, kph: Math.round(ts.value.fieldBest.trap.speed), lap: ts.value.fieldBest.trap.lap } : null, drivers: ts.value.drivers.slice(0, 22).map(r => ({ driver: r.driver.name_acronym, team: r.team, trap: r.trap ? Math.round(r.trap.speed) : null, clear: r.trapClear ? Math.round(r.trapClear.speed) : null, tow: r.trapTow ? Math.round(r.trapTow.speed) : null, i1: r.i1 ? Math.round(r.i1.speed) : null, i2: r.i2 ? Math.round(r.i2.speed) : null })) };
  if (se.ok) tables.sectors = { kings: se.value.kings.map(k => k.name_acronym), ultimateLap: r3(se.value.ultimateLap), rows: se.value.rows.slice(0, 10).map(r => ({ driver: r.driver.name_acronym, medians: r.medians.map(r3), deltas: r.deltas.map(r3), theoretical: r3(r.theoretical), trapClear: r.trapClear })) };
  const da = dirtyAirAnalysis(model);
  if (da.ok) tables.dirtyAir = { costByGap: da.value.costByGap.map(b => ({ bin: b.bin, loss: r3(b.medianLoss), n: b.n })), drivers: da.value.drivers.filter(d => d.medianLoss != null).slice(0, 12).map(d => ({ driver: d.driver.name_acronym, lossPerLap: r3(d.medianLoss), dirtyLaps: d.dirtyLaps, clearShare: r3(d.clearShare) })) };
  const ni = neutralisationImpact(model);
  if (ni.ok) tables.neutralisations = ni.value.map(w => ({ kind: w.window.kind, laps: [w.window.lapStart, w.window.lapEnd], winners: w.winners.map(r => ({ driver: r.driver.name_acronym, delta: r3(r.delta) })), losers: w.losers.map(r => ({ driver: r.driver.name_acronym, delta: r3(r.delta) })) }));
  tables.weather = model.weather.length ? {
    trackTemp: [Math.min(...model.weather.map(w => w.track_temperature)), Math.max(...model.weather.map(w => w.track_temperature))],
    airTemp: [Math.min(...model.weather.map(w => w.air_temperature)), Math.max(...model.weather.map(w => w.air_temperature))],
    rain: model.weather.some(w => w.rainfall === true || (typeof w.rainfall === "number" && w.rainfall > 0)),
  } : null;

  return {
    schemaVersion: 1,
    engine: "openf1ow-engine/1",
    session: {
      key: model.info.session_key, name: model.info.session_name, type: model.info.session_type,
      meeting: model.meeting?.meeting_name ?? null, circuit: model.info.circuit_short_name ?? model.meeting?.circuit_short_name ?? null,
      year: model.info.year ?? null, sprint: model.sprint, totalLaps: model.totalLaps,
    },
    coverage: model.coverage,
    warnings: model.warnings,
    fuel: model.fuel,
    verdicts,
    tables,
  };
}
