// Pure cross-race aggregators. Returns raw numbers (seconds, slope/lap),
// not strings — formatting belongs to the render layer.

import type { Driver, Lap, Stint } from "./types";
import {
  median,
  computeSlowLapThreshold,
  isCleanLap,
  stintDegradation,
  fuelCorrPerLap,
} from "./raceUtils";

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
}

interface PaceRow {
  driver: string;          // name_acronym
  team: string;            // team_name
  teamColour?: string;
  medianPace: number;      // seconds
  bestLap: number;         // seconds
  cleanLaps: number;
}

function paceByDriver(laps: Lap[], drivers: Driver[]): PaceRow[] {
  const threshold = computeSlowLapThreshold(laps);
  if (!isFinite(threshold)) return [];

  const byDriver: Record<number, number[]> = {};
  for (const l of laps) {
    if (!isCleanLap(l, threshold)) continue;
    (byDriver[l.driver_number] ||= []).push(l.lap_duration!);
  }

  return drivers
    .map(d => {
      const times = byDriver[d.driver_number];
      if (!times || times.length < 3) return null;
      times.sort((a, b) => a - b);
      return {
        driver: d.name_acronym,
        team: d.team_name,
        teamColour: d.team_colour,
        medianPace: median(times),
        bestLap: times[0],
        cleanLaps: times.length,
      };
    })
    .filter((x): x is PaceRow => !!x);
}

export interface ConstructorPacePoint {
  team: string;
  medianPace: number;       // sec
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

export function aggregateConstructorPaceByRace(races: RaceData[]): ConstructorPaceRace[] {
  return races
    .map(r => {
      const rows = paceByDriver(r.laps, r.drivers);
      if (rows.length < 4) return null; // not enough usable data

      // Group driver paces by team
      const byTeam: Record<string, number[]> = {};
      for (const row of rows) {
        const t = row.team || "Unknown";
        (byTeam[t] ||= []).push(row.medianPace);
      }

      const teamRows: ConstructorPacePoint[] = Object.entries(byTeam)
        .filter(([, paces]) => paces.length > 0)
        .map(([team, paces]) => ({
          team,
          medianPace: median(paces),
          gapToFastest: 0, // filled below
          drivers: paces.length,
        }));

      if (teamRows.length === 0) return null;
      teamRows.sort((a, b) => a.medianPace - b.medianPace);
      const fastest = teamRows[0].medianPace;
      teamRows.forEach(t => { t.gapToFastest = +(t.medianPace - fastest).toFixed(3); });

      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        fastestTeamMedian: +fastest.toFixed(3),
        teams: teamRows.map(t => ({ ...t, medianPace: +t.medianPace.toFixed(3) })),
      };
    })
    .filter((x): x is ConstructorPaceRace => !!x);
}

// Per team, per race: which teammate was faster on common clean laps and
// by how much (always positive — caller decides the sign convention).

export interface TeammateGapPoint {
  team: string;
  faster: string;       // name_acronym
  slower: string;
  gap: number;          // sec, always >= 0
  commonLaps: number;
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
      const threshold = computeSlowLapThreshold(r.laps);
      if (!isFinite(threshold)) return null;

      // Group drivers by team
      const teamDrivers: Record<string, Driver[]> = {};
      for (const d of r.drivers) {
        const t = d.team_name || "Unknown";
        (teamDrivers[t] ||= []).push(d);
      }

      // Lookup laps by driver
      const byDriver: Record<number, Lap[]> = {};
      for (const l of r.laps) {
        (byDriver[l.driver_number] ||= []).push(l);
      }

      const teamRows: TeammateGapPoint[] = [];
      for (const [team, ds] of Object.entries(teamDrivers)) {
        if (ds.length < 2) continue;
        const [d1, d2] = ds.slice(0, 2);
        const laps1 = (byDriver[d1.driver_number] || []).filter(l => isCleanLap(l, threshold));
        const laps2 = (byDriver[d2.driver_number] || []).filter(l => isCleanLap(l, threshold));

        const l1ByLap: Record<number, number> = {};
        laps1.forEach(l => { l1ByLap[l.lap_number] = l.lap_duration!; });

        const t1: number[] = [];
        const t2: number[] = [];
        for (const l of laps2) {
          if (l1ByLap[l.lap_number]) {
            t1.push(l1ByLap[l.lap_number]);
            t2.push(l.lap_duration!);
          }
        }
        if (t1.length < 3) continue;

        const m1 = median(t1);
        const m2 = median(t2);
        const d1Faster = m1 <= m2;
        teamRows.push({
          team,
          faster: d1Faster ? d1.name_acronym : d2.name_acronym,
          slower: d1Faster ? d2.name_acronym : d1.name_acronym,
          gap: +Math.abs(m1 - m2).toFixed(3),
          commonLaps: t1.length,
        });
      }

      if (teamRows.length === 0) return null;
      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        teams: teamRows.sort((a, b) => b.gap - a.gap),
      };
    })
    .filter((x): x is TeammateGapRace => !!x);
}

export interface CompoundDegPoint {
  compound: string;          // SOFT | MEDIUM | HARD | INTERMEDIATE | WET
  medianDeg: number;         // sec/lap, fuel-corrected
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
      const threshold = computeSlowLapThreshold(r.laps);
      if (!isFinite(threshold)) return null;

      const totalLaps = r.laps.reduce((m, l) => Math.max(m, l.lap_number), 0);
      if (totalLaps < 5) return null;
      const fc = fuelCorrPerLap(totalLaps);

      // lap lookup keyed "{driver_number}-{lap_number}"
      const lapLookup: Record<string, Lap> = {};
      for (const l of r.laps) lapLookup[l.driver_number + "-" + l.lap_number] = l;

      const byCompound: Record<string, number[]> = {};
      for (const st of r.stints) {
        const result = stintDegradation(st, lapLookup, threshold, fc);
        if (!result) continue;
        const c = (st.compound || "UNKNOWN").toUpperCase();
        (byCompound[c] ||= []).push(result.deg);
      }

      const compounds: CompoundDegPoint[] = Object.entries(byCompound)
        .filter(([, vals]) => vals.length > 0)
        .map(([compound, vals]) => ({
          compound,
          medianDeg: +median(vals).toFixed(4),
          stints: vals.length,
        }))
        .sort((a, b) => a.compound.localeCompare(b.compound));

      if (compounds.length === 0) return null;
      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        compounds,
      };
    })
    .filter((x): x is TireDegRace => !!x);
}

// Top-level artifact shape written to R2.

export interface SeasonTrends {
  generatedAt: string;        // ISO timestamp
  year: number;
  raceCount: number;
  constructorPace: ConstructorPaceRace[];
  teammateGap: TeammateGapRace[];
  tireDeg: TireDegRace[];
}

export function buildSeasonTrends(year: number, races: RaceData[]): SeasonTrends {
  return {
    generatedAt: new Date().toISOString(),
    year,
    raceCount: races.length,
    constructorPace: aggregateConstructorPaceByRace(races),
    teammateGap: aggregateTeammateGapTrend(races),
    tireDeg: aggregateTireDegByCompound(races),
  };
}
