// buildSessionModel — the engine's single entry point. Everything the UI,
// the LLM prompt, the recap and the trends script know about a session is
// derived here, once.

import type { SessionInputs, Pit } from "../types/raw.ts";
import type {
  SessionModel, DriverSummary, EnrichedLap, EnrichedPit, TeamSummary, Coverage,
} from "../types/model.ts";
import { classifySession, isSprint } from "./classify.ts";
import { lapTimes, sessionStart, chequeredAt, parseTs } from "./timeline.ts";
import { buildNeutralisations } from "./neutralisations.ts";
import { buildTrafficIndex } from "./intervalsJoin.ts";
import { buildWeatherIndex } from "./weatherJoin.ts";
import { classifyDrivers } from "./results.ts";
import { baseFuelModel } from "./fuel.ts";
import { enrichLaps } from "./lapFlags.ts";
import { enrichStints } from "./stints.ts";
import { lastIndexLE } from "../stats.ts";

export function buildSessionModel(inputs: SessionInputs): SessionModel {
  const warnings: string[] = [];
  const { session, drivers, laps } = inputs;
  const stints = inputs.stints ?? [];
  const pits = inputs.pits ?? [];
  const kind = classifySession(session.session_type, session.session_name);

  const times = lapTimes(laps);
  const raceStart = sessionStart(laps, times);
  const chequered = chequeredAt(inputs.raceControl, times);

  const { byDriver: classification, totalLaps, fromResults } = classifyDrivers(drivers, laps, inputs.results, kind);
  if (kind === "race" && !fromResults) warnings.push("No classification from the timing feed — retirements inferred from lap counts.");

  const sprint = isSprint(session, totalLaps);
  const fuel0 = baseFuelModel(sprint, totalLaps);

  // Earliest start of each lap number across the field ≈ the leader's laps.
  const leaderLaps = Object.values(
    laps.reduce<Record<number, { lap: number; tStart: number }>>((acc, l) => {
      const t = times[`${l.driver_number}-${l.lap_number}`]?.tStart;
      if (t == null || !Number.isFinite(t)) return acc;
      if (!acc[l.lap_number] || t < acc[l.lap_number].tStart) acc[l.lap_number] = { lap: l.lap_number, tStart: t };
      return acc;
    }, {}),
  ).sort((a, b) => a.tStart - b.tStart);

  const neutralisations = buildNeutralisations(inputs.raceControl, leaderLaps, chequered);
  const traffic = buildTrafficIndex(inputs.intervals, inputs.position, laps);
  const weather = buildWeatherIndex(inputs.weather);

  if (kind === "race" && !traffic.hasIntervals) warnings.push("Timing intervals not available — traffic and gap analyses are gated off rather than estimated.");
  if (kind === "race" && !inputs.raceControl?.length) warnings.push("Race-control messages not available — safety-car laps cannot be excluded.");

  const { laps: enriched, fuel } = enrichLaps(laps, {
    kind, times, stints, pits, neutralisations, classification, traffic, weather, fuel: fuel0,
  });

  const lapByKey: Record<string, EnrichedLap> = {};
  const lapsByNumber: Record<number, EnrichedLap[]> = {};
  const lapsByDriver: Record<number, EnrichedLap[]> = {};
  for (const l of enriched) {
    lapByKey[l.key] = l;
    (lapsByNumber[l.lap_number] ||= []).push(l);
    (lapsByDriver[l.driver_number] ||= []).push(l);
  }
  for (const arr of Object.values(lapsByDriver)) arr.sort((a, b) => a.lap_number - b.lap_number);

  // Pit metric: decided once per session so stops are compared like for like.
  const stationaryCount = pits.filter(p => (p.stop_duration ?? null) != null).length;
  const laneCount = pits.filter(p => (p.lane_duration ?? p.pit_duration ?? null) != null).length;
  const pitMetric: SessionModel["pitMetric"] =
    !pits.length ? null : stationaryCount >= pits.length / 2 ? "stationary" : laneCount ? "lane" : null;
  if (pits.length && pitMetric === "lane") warnings.push("Stationary pit times not published for this session — stops are compared on pit-lane time.");

  const enrichedPits: EnrichedPit[] = pits.map((p: Pit) => {
    const tStart = parseTs(p.date);
    const under = neutralisations.findIndex(n => tStart >= n.tStart && tStart <= n.tEnd && n.kind !== "YELLOW");
    const stationary = p.stop_duration ?? null;
    const laneTime = p.lane_duration ?? p.pit_duration ?? null;
    return {
      ...p,
      tStart,
      inLapKey: `${p.driver_number}-${p.lap_number}`,
      outLapKey: `${p.driver_number}-${p.lap_number + 1}`,
      stationary,
      laneTime,
      duration: pitMetric === "stationary" ? stationary : pitMetric === "lane" ? laneTime : null,
      underNeutralisation: under >= 0 ? under : null,
    };
  }).sort((a, b) => a.tStart - b.tStart);

  const allStints = enrichStints(stints, lapsByDriver);

  // Grid: starting_grid when present; else the position feed before lights out.
  const grid: Record<number, number> = {};
  let gridSource: DriverSummary["gridSource"] = null;
  if (inputs.startingGrid?.length) {
    for (const g of inputs.startingGrid) grid[g.driver_number] = g.position;
    gridSource = "starting_grid";
  } else if (inputs.position?.length && raceStart != null) {
    const byD: Record<number, { t: number; p: number }[]> = {};
    for (const r of inputs.position) {
      const t = parseTs(r.date);
      if (Number.isFinite(t)) (byD[r.driver_number] ||= []).push({ t, p: r.position });
    }
    for (const [d, arr] of Object.entries(byD)) {
      arr.sort((a, b) => a.t - b.t);
      const i = lastIndexLE(arr, x => x.t, raceStart);
      grid[Number(d)] = (i >= 0 ? arr[i] : arr[0]).p;
    }
    gridSource = "first_position";
    if (kind === "race") warnings.push("Starting grid not published — taken from the position feed before the start.");
  }

  const teams: Record<string, TeamSummary> = {};
  for (const d of drivers) {
    const name = d.team_name || "Unknown";
    (teams[name] ||= { name, color: d.team_colour || "666666", drivers: [] }).drivers.push(d);
  }

  const summaries: DriverSummary[] = drivers.map(d => {
    const dl = lapsByDriver[d.driver_number] ?? [];
    return {
      driver: d,
      team: d.team_name || "Unknown",
      classification: classification[d.driver_number],
      gridPosition: grid[d.driver_number] ?? null,
      gridSource: grid[d.driver_number] != null ? gridSource : null,
      stints: allStints.filter(s => s.driver_number === d.driver_number),
      pits: enrichedPits.filter(p => p.driver_number === d.driver_number),
      laps: dl,
      cleanLapCount: dl.filter(l => l.clean).length,
      clearAirLapCount: dl.filter(l => l.clearAir).length,
    };
  });
  const byDriver: Record<number, DriverSummary> = {};
  for (const s of summaries) byDriver[s.driver.driver_number] = s;

  const coverage: Coverage = {
    stints: stints.length > 0,
    pits: pits.length > 0,
    intervals: traffic.hasIntervals,
    position: traffic.hasPosition,
    raceControl: !!inputs.raceControl?.length,
    results: fromResults,
    weather: weather.has,
    startingGrid: !!inputs.startingGrid?.length,
    overtakes: !!inputs.overtakes?.length,
  };

  if (fuel.source === "fitted") {
    warnings.push(`Fuel effect fitted at ${fuel.secPerKg.toFixed(3)} s/kg from ${fuel.fitPairs} matched lap pairs.`);
  }

  return {
    info: session,
    meeting: inputs.meeting ?? null,
    kind,
    sprint,
    totalLaps,
    raceStart,
    chequered,
    drivers: summaries,
    byDriver,
    laps: enriched,
    lapByKey,
    lapsByNumber,
    teams,
    neutralisations,
    fuel,
    weather: inputs.weather ?? [],
    pitMetric,
    overtakes: inputs.overtakes ?? [],
    coverage,
    warnings,
  };
}
