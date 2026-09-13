// Pure cross-race aggregators. Returns raw numbers (seconds, slope/lap),
// not strings — formatting belongs to the render layer.
//
// Every aggregation builds the engine's SessionModel for the race (and the
// qualifying session where one is needed) and reads the engine's analyses,
// so the season page, the race page and the trends script agree on what a
// clean lap, a degradation slope or a teammate gap is. The extra race
// resources in RaceData are optional: when race_control, intervals or the
// classification are present the engine excludes safety-car laps and traffic
// and drops retired cars' trailing laps; when they are absent it says so in
// model.warnings and falls back to the robust per-stint outlier filter alone.

import type {
  Driver, Lap, Stint, Pit, RaceControlMsg, SessionResultRow, Interval, PositionRow, Weather, SessionInfo,
} from "../engine/types/raw.ts";
import {
  conversionAnalysis, tyreLife, topSpeeds,
  buildSessionModel, paceRanking, teammateComparisons, compoundSummary, bestLapsByDriver, eligibleForBest,
  type SessionModel,
} from "../engine/index.ts";
import { median } from "../engine/stats.ts";

export interface RaceMeta {
  meetingKey: number;
  slug: string;
  meetingName: string;
  country: string;
  location: string;
  dateStart: string;     // YYYY-MM-DD
  round: number;         // 1..n in the season, by date order
}

export interface RaceData {
  meta: RaceMeta;
  drivers: Driver[];
  laps: Lap[];
  stints: Stint[];
  qualiLaps?: Lap[];
  // Optional extras for the race session — see the header comment.
  pits?: Pit[];
  raceControl?: RaceControlMsg[];
  results?: SessionResultRow[];
  intervals?: Interval[];
  position?: PositionRow[];
  weather?: Weather[];
  // Optional extras for the qualifying session.
  qualiDrivers?: Driver[];
  qualiStints?: Stint[];
  raceSessionKey?: number;
  qualiSessionKey?: number;
  /** Set when the weekend's race session is a sprint. */
  sprint?: boolean;
}

/** The engine needs a SessionInfo; the race index only carries session keys,
 *  so synthesise the fields that matter for classification. Timestamps come
 *  from the laps and race control, not from here. */
function syntheticSession(r: RaceData, kind: "race" | "qualifying"): SessionInfo {
  const day = r.meta.dateStart || "1970-01-01";
  return {
    session_key: (kind === "race" ? r.raceSessionKey : r.qualiSessionKey) ?? 0,
    meeting_key: r.meta.meetingKey,
    session_name: kind === "race" ? (r.sprint ? "Sprint" : "Race") : "Qualifying",
    session_type: kind === "race" ? "Race" : "Qualifying",
    date_start: `${day}T00:00:00+00:00`,
    date_end: `${day}T23:59:59+00:00`,
    year: Number(day.slice(0, 4)) || undefined,
  };
}

const modelCache = new WeakMap<RaceData, { race?: SessionModel; quali?: SessionModel | null }>();

export function raceModel(r: RaceData): SessionModel {
  const c = modelCache.get(r) ?? {};
  if (!c.race) {
    c.race = buildSessionModel({
      session: syntheticSession(r, "race"),
      drivers: r.drivers,
      laps: r.laps,
      stints: r.stints,
      pits: r.pits ?? null,
      raceControl: r.raceControl ?? null,
      results: r.results ?? null,
      intervals: r.intervals ?? null,
      position: r.position ?? null,
      weather: r.weather ?? null,
    });
    modelCache.set(r, c);
  }
  return c.race;
}

export function qualiModel(r: RaceData): SessionModel | null {
  const c = modelCache.get(r) ?? {};
  if (c.quali === undefined) {
    c.quali = r.qualiLaps?.length
      ? buildSessionModel({
          session: syntheticSession(r, "qualifying"),
          drivers: r.qualiDrivers?.length ? r.qualiDrivers : r.drivers,
          laps: r.qualiLaps,
          stints: r.qualiStints ?? null,
        })
      : null;
    modelCache.set(r, c);
  }
  return c.quali;
}

function meta(r: RaceData) {
  return {
    meetingKey: r.meta.meetingKey,
    slug: r.meta.slug,
    meetingName: r.meta.meetingName,
    dateStart: r.meta.dateStart,
    round: r.meta.round,
  };
}

export interface ConstructorPacePoint {
  team: string;
  medianPace: number;       // sec — median of the team's drivers' fuel-corrected medians
  gapToFastest: number;     // sec, +0.000 for the leader
  drivers: number;          // count of drivers contributing data
}

export interface ConstructorPaceRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  fastestTeamMedian: number; // sec — the reference for gapToFastest
  teams: ConstructorPacePoint[];
}

/** Share of the race distance a driver must have covered to represent their
 *  team's race pace. Fuel-corrected medians are comparable across cars at
 *  equal fuel, but a car that retired on lap 20 only ever ran heavy and its
 *  corrected median would flatter the team by several seconds. */
const MIN_RACE_SHARE = 0.75;

export function aggregateConstructorPaceByRace(races: RaceData[]): ConstructorPaceRace[] {
  return races
    .map(r => {
      const model = raceModel(r);
      const pace = paceRanking(model);
      if (!pace.ok) return null;
      const rows = pace.value.ranked.filter(row => {
        const laps = model.byDriver[row.driver.driver_number]?.classification.lapsCompleted ?? 0;
        return laps >= MIN_RACE_SHARE * model.totalLaps;
      });
      if (rows.length < 4) return null;

      const byTeam: Record<string, number[]> = {};
      for (const row of rows) (byTeam[row.team] ||= []).push(row.medianPace);

      const teamRows: ConstructorPacePoint[] = Object.entries(byTeam)
        .map(([team, paces]) => ({ team, medianPace: median(paces), gapToFastest: 0, drivers: paces.length }))
        .sort((a, b) => a.medianPace - b.medianPace);
      if (!teamRows.length) return null;
      const fastest = teamRows[0].medianPace;
      return {
        ...meta(r),
        fastestTeamMedian: +fastest.toFixed(3),
        teams: teamRows.map(t => ({
          ...t,
          medianPace: +t.medianPace.toFixed(3),
          gapToFastest: +(t.medianPace - fastest).toFixed(3),
        })),
      };
    })
    .filter((x): x is ConstructorPaceRace => !!x);
}

// Per team, per race: best qualifying lap of the quicker driver becomes the
// "constructor's qualifying time". Gap to the fastest constructor mirrors
// the race-pace evolution chart, but uses single-lap push pace instead of
// race medians — much closer to "raw car potential".

export interface ConstructorQualifyingPoint {
  team: string;
  bestLap: number;          // sec — fastest of the team's drivers in quali
  bestDriver: string;       // name_acronym of who set it
  gapToFastest: number;     // sec, +0.000 for the leader
}

export interface ConstructorQualifyingRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  fastestTeamBest: number;  // sec — the reference for gapToFastest
  teams: ConstructorQualifyingPoint[];
  // Cutoffs derived from all-drivers-sorted best laps: 15th best ≈ Q1
  // elimination boundary, 10th best ≈ Q2 elimination boundary.
  q1Cutoff?: number;        // sec — 15th-best driver's best lap (absolute)
  q1CutoffGap?: number;     // sec — gap to fastest constructor
  q2Cutoff?: number;        // sec — 10th-best
  q2CutoffGap?: number;     // sec
}

/** A driver's best is trusted only with two or more genuine push laps —
 *  laps within 3 % of that best — since a single quick lap may be a
 *  compromised or aborted attempt read the wrong way. */
const PUSH_LAP_TOLERANCE = 1.03;

export function aggregateConstructorQualifyingByRace(races: RaceData[]): ConstructorQualifyingRace[] {
  return races
    .map(r => {
      const model = qualiModel(r);
      if (!model) return null;
      const best = bestLapsByDriver(model);
      if (!best.ok) return null;

      const bestByDriver: Record<number, { lap: number; acronym: string; team: string }> = {};
      for (const row of best.value) {
        const pushLaps = model.byDriver[row.driver.driver_number].laps
          .filter(l => eligibleForBest(l) && (l.lap_duration as number) <= row.bestLap * PUSH_LAP_TOLERANCE).length;
        if (pushLaps < 2) continue;
        bestByDriver[row.driver.driver_number] = { lap: row.bestLap, acronym: row.driver.name_acronym, team: row.team };
      }

      const teamRows: { team: string; bestLap: number; bestDriver: string }[] = [];
      for (const team of Object.values(model.teams)) {
        let b: { lap: number; acronym: string } | null = null;
        for (const d of team.drivers) {
          const e = bestByDriver[d.driver_number];
          if (e && (!b || e.lap < b.lap)) b = e;
        }
        if (b) teamRows.push({ team: team.name, bestLap: b.lap, bestDriver: b.acronym });
      }
      if (teamRows.length < 4) return null;

      teamRows.sort((a, b) => a.bestLap - b.bestLap);
      const fastest = teamRows[0].bestLap;
      const allBestLaps = Object.values(bestByDriver).map(e => e.lap).sort((a, b) => a - b);
      const q1Cutoff = allBestLaps[14];
      const q2Cutoff = allBestLaps[9];

      return {
        ...meta(r),
        fastestTeamBest: +fastest.toFixed(3),
        teams: teamRows.map(t => ({
          team: t.team,
          bestLap: +t.bestLap.toFixed(3),
          bestDriver: t.bestDriver,
          gapToFastest: +(t.bestLap - fastest).toFixed(3),
        })),
        ...(q1Cutoff != null ? { q1Cutoff: +q1Cutoff.toFixed(3), q1CutoffGap: +(q1Cutoff - fastest).toFixed(3) } : {}),
        ...(q2Cutoff != null ? { q2Cutoff: +q2Cutoff.toFixed(3), q2CutoffGap: +(q2Cutoff - fastest).toFixed(3) } : {}),
      };
    })
    .filter((x): x is ConstructorQualifyingRace => !!x);
}

// Per team, per race: which teammate was faster on paired clean clear-air
// laps and by how much (always positive — caller decides the sign
// convention). Every driver on the team is considered; the pair with the
// most shared laps is the one reported.

export interface TeammateGapPoint {
  team: string;
  faster: string;       // name_acronym
  slower: string;
  gap: number;          // sec, always >= 0
  commonLaps: number;
  significant?: boolean;   // bootstrap CI excludes zero and ≥ 10 paired laps
}

export interface TeammateGapRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  teams: TeammateGapPoint[];
}

export function aggregateTeammateGapTrend(races: RaceData[]): TeammateGapRace[] {
  return races
    .map(r => {
      const cmp = teammateComparisons(raceModel(r));
      if (!cmp.ok) return null;
      const teams: TeammateGapPoint[] = cmp.value.map(t => ({
        team: t.team,
        faster: t.primary.faster.name_acronym,
        slower: t.primary.slower.name_acronym,
        gap: +t.primary.gap.toFixed(3),
        commonLaps: t.primary.n,
        significant: t.primary.significant,
      }));
      if (!teams.length) return null;
      return { ...meta(r), teams: teams.sort((a, b) => b.gap - a.gap) };
    })
    .filter((x): x is TeammateGapRace => !!x);
}

export interface CompoundDegPoint {
  compound: string;          // SOFT | MEDIUM | HARD | INTERMEDIATE | WET
  medianDeg: number;         // sec/lap, fuel-corrected; negative allowed
  stints: number;            // count of stints contributing
}

export interface TireDegRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  compounds: CompoundDegPoint[];
}

export function aggregateTireDegByCompound(races: RaceData[]): TireDegRace[] {
  return races
    .map(r => {
      const model = raceModel(r);
      if (model.totalLaps < 5) return null;
      const summary = compoundSummary(model);
      if (!summary.ok) return null;
      const compounds: CompoundDegPoint[] = summary.value
        .map(c => ({ compound: c.compound, medianDeg: +c.medianDeg.toFixed(4), stints: c.stints }))
        .sort((a, b) => a.compound.localeCompare(b.compound));
      if (!compounds.length) return null;
      return { ...meta(r), compounds };
    })
    .filter((x): x is TireDegRace => !!x);
}

// ---------------------------------------------------------------------------
// Grid → finish conversion
// ---------------------------------------------------------------------------
// Did a team turn its grid slots into results? Per race: the mean places its
// classified drivers gained from grid to flag, and the mean of "pace rank −
// finish" (positive = finished better than the car's race pace said it should).

export interface ConversionPoint {
  team: string;
  drivers: number;             // classified drivers counted
  meanGridToFinish: number;    // places gained (positive) per driver
  meanPaceToFinish: number | null;
}

export interface ConversionRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  teams: ConversionPoint[];
}

export function aggregateConversionByRace(races: RaceData[]): ConversionRace[] {
  return races
    .map(r => {
      const cv = conversionAnalysis(raceModel(r));
      if (!cv.ok) return null;
      const byTeam: Record<string, { g: number[]; p: number[] }> = {};
      for (const row of cv.value.rows) {
        if (row.gridToFinish == null) continue;
        const t = (byTeam[row.team] ||= { g: [], p: [] });
        t.g.push(row.gridToFinish);
        if (row.paceToFinish != null) t.p.push(row.paceToFinish);
      }
      const teams: ConversionPoint[] = Object.entries(byTeam).map(([team, t]) => ({
        team, drivers: t.g.length,
        meanGridToFinish: +(t.g.reduce((a, b) => a + b, 0) / t.g.length).toFixed(2),
        meanPaceToFinish: t.p.length ? +(t.p.reduce((a, b) => a + b, 0) / t.p.length).toFixed(2) : null,
      }));
      if (!teams.length) return null;
      return { ...meta(r), teams: teams.sort((a, b) => b.meanGridToFinish - a.meanGridToFinish) };
    })
    .filter((x): x is ConversionRace => !!x);
}

// ---------------------------------------------------------------------------
// Tyre life by compound
// ---------------------------------------------------------------------------
// How long each compound was run and where it fell away, from the pooled
// residual curves (see engine/analyses/tyreLife).

export interface TyreLifePoint {
  compound: string;
  p90StintLength: number;      // laps
  cliffAge: number | null;     // tyre age where the pooled curve steps up, if it did
  pooledSlope: number | null;  // s/lap
  stints: number;
}

export interface TyreLifeRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  compounds: TyreLifePoint[];
}

export function aggregateTyreLifeByCompound(races: RaceData[]): TyreLifeRace[] {
  return races
    .map(r => {
      const tl = tyreLife(raceModel(r));
      if (!tl.ok) return null;
      const compounds: TyreLifePoint[] = tl.value.map(c => ({
        compound: c.compound, p90StintLength: c.p90StintLength, cliffAge: c.cliffAge,
        pooledSlope: c.pooledSlope != null ? +c.pooledSlope.toFixed(4) : null, stints: c.stints,
      })).sort((a, b) => a.compound.localeCompare(b.compound));
      if (!compounds.length) return null;
      return { ...meta(r), compounds };
    })
    .filter((x): x is TyreLifeRace => !!x);
}

// ---------------------------------------------------------------------------
// Top speed by team
// ---------------------------------------------------------------------------
// Straight-line speed across the year: each team's best speed-trap reading
// in qualifying (single-lap, low fuel, DRS open) and in the race, per round.

export interface TopSpeedPoint {
  team: string;
  qualiTrap: number | null;     // km/h, best of the team's drivers in qualifying
  raceTrap: number | null;      // km/h, best in the race (any traffic state)
  raceTrapClear: number | null; // km/h, best with clear air ahead, when intervals exist
  driver: string | null;        // who set the qualifying best
}

export interface TopSpeedRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  teams: TopSpeedPoint[];
}

export function aggregateTopSpeedByRace(races: RaceData[]): TopSpeedRace[] {
  return races
    .map(r => {
      const race = topSpeeds(raceModel(r));
      const qm = qualiModel(r);
      const quali = qm ? topSpeeds(qm) : null;
      const byTeam: Record<string, TopSpeedPoint> = {};
      if (quali?.ok) for (const t of quali.value.teams) byTeam[t.team] = { team: t.team, qualiTrap: t.trap ? Math.round(t.trap.speed) : null, raceTrap: null, raceTrapClear: null, driver: t.trap?.driver.name_acronym ?? null };
      if (race.ok) {
        for (const t of race.value.teams) {
          const p = (byTeam[t.team] ||= { team: t.team, qualiTrap: null, raceTrap: null, raceTrapClear: null, driver: null });
          p.raceTrap = t.trap ? Math.round(t.trap.speed) : null;
          const clear = race.value.drivers.filter(d => d.team === t.team && d.trapClear).map(d => d.trapClear!.speed);
          p.raceTrapClear = clear.length ? Math.round(Math.max(...clear)) : null;
        }
      }
      const teams = Object.values(byTeam).filter(p => p.qualiTrap != null || p.raceTrap != null);
      if (!teams.length) return null;
      return { ...meta(r), teams: teams.sort((a, b) => (b.qualiTrap ?? b.raceTrap ?? 0) - (a.qualiTrap ?? a.raceTrap ?? 0)) };
    })
    .filter((x): x is TopSpeedRace => !!x);
}

// ---------------------------------------------------------------------------
// Corner / straight balance
// ---------------------------------------------------------------------------
// Where each team finds (or loses) its lap time: cornering vs straight-line
// running. Built from qualifying telemetry — each team's fastest lap of the
// weekend is split into corner and straight sections (see lib/lapSegments) and
// timed against the fastest team's lap. cornerGap + curveGap + straightGap is
// exactly the team's lap-time gap, so the numbers are a true decomposition
// rather than loosely related indices. The curve fields are optional: artifacts
// built before fast curves were split out of the straights only carry the
// two-way split, and readers treat a missing curve share as zero.
//
// Unlike the other aggregations this one can't be computed from RaceData —
// it needs per-lap car_data and location, which only the offline trends script
// fetches. buildSeasonTrends therefore leaves it out.

export interface CornerStraightPoint {
  team: string;
  driver: string;           // name_acronym of whoever set the team's lap
  lapTime: number;          // sec
  cornerTime: number;       // sec — summed across the lap's corner sections
  curveTime?: number;       // sec — summed across the fast curves (absent in two-way artifacts)
  straightTime: number;     // sec — summed across the straights
  cornerGap: number;        // sec vs the reference team's corner total
  curveGap?: number;        // sec vs the reference team's fast-curve total
  straightGap: number;      // sec vs the reference team's straight total
  gapToFastest: number;     // sec — equals cornerGap + (curveGap ?? 0) + straightGap
}

export interface CornerStraightRace {
  meetingKey: number;
  slug: string;
  meetingName: string;
  dateStart: string;
  round: number;
  referenceTeam: string;    // fastest team that weekend — the 0.000 baseline
  cornerCount: number;      // corner sections the circuit was split into
  curveCount?: number;      // fast-curve sections (absent in two-way artifacts)
  straightCount: number;
  cornerDistance: number;   // m of the lap classified as corner
  curveDistance?: number;
  straightDistance: number;
  trackDistance: number;    // m — measured lap length
  teams: CornerStraightPoint[];
}

export interface SeasonTrends {
  generatedAt: string;        // ISO timestamp
  year: number;
  raceCount: number;
  constructorPace: ConstructorPaceRace[];
  constructorQualifying?: ConstructorQualifyingRace[]; // optional — older artifacts may not have this
  teammateGap: TeammateGapRace[];
  tireDeg: TireDegRace[];
  cornerStraight?: CornerStraightRace[]; // optional — telemetry-derived, only in artifacts built with it
  conversion?: ConversionRace[];         // optional — artifacts since 2026-09
  tyreLife?: TyreLifeRace[];             // optional — artifacts since 2026-09
  topSpeed?: TopSpeedRace[];             // optional — artifacts since 2026-09
}

export function buildSeasonTrends(year: number, races: RaceData[]): SeasonTrends {
  return {
    generatedAt: new Date().toISOString(),
    year,
    raceCount: races.length,
    constructorPace: aggregateConstructorPaceByRace(races),
    constructorQualifying: aggregateConstructorQualifyingByRace(races),
    teammateGap: aggregateTeammateGapTrend(races),
    tireDeg: aggregateTireDegByCompound(races),
    conversion: aggregateConversionByRace(races),
    tyreLife: aggregateTyreLifeByCompound(races),
    topSpeed: aggregateTopSpeedByRace(races),
  };
}
