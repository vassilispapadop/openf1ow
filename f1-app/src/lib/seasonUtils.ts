// Pure cross-race aggregators. Returns raw numbers (seconds, slope/lap),
// not strings — formatting belongs to the render layer.

import type { Driver, Lap, Stint } from "./types";
import {
  median,
  computeSlowLapThreshold,
  isCleanLap,
  stintDegradation,
  fuelCorrPerLap,
  paceByDriver,
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
  qualiLaps?: Lap[];
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
        const t = row.driver.team_name || "Unknown";
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

export function aggregateConstructorQualifyingByRace(races: RaceData[]): ConstructorQualifyingRace[] {
  return races
    .map(r => {
      const laps = r.qualiLaps?.length ? r.qualiLaps : null;
      if (!laps) return null;
      const threshold = computeSlowLapThreshold(laps);
      if (!isFinite(threshold)) return null;

      const cleanByDriver: Record<number, number[]> = {};
      for (const l of laps) {
        if (!isCleanLap(l, threshold)) continue;
        (cleanByDriver[l.driver_number] ||= []).push(l.lap_duration!);
      }

      // Require 2+ clean push laps for a reliable "best" — single laps may
      // be aborted/compromised attempts.
      const bestByDriver: Record<number, number> = {};
      for (const [num, ls] of Object.entries(cleanByDriver)) {
        if (ls.length < 2) continue;
        bestByDriver[Number(num)] = Math.min(...ls);
      }

      const teamByDriver: Record<string, Driver[]> = {};
      for (const d of r.drivers) {
        const t = d.team_name || "Unknown";
        (teamByDriver[t] ||= []).push(d);
      }

      const teamRows: { team: string; bestLap: number; bestDriver: string }[] = [];
      for (const [team, drivers] of Object.entries(teamByDriver)) {
        let best: { lap: number; driver: string } | null = null;
        for (const d of drivers) {
          const lap = bestByDriver[d.driver_number];
          if (lap == null) continue;
          if (!best || lap < best.lap) best = { lap, driver: d.name_acronym };
        }
        if (best) teamRows.push({ team, bestLap: best.lap, bestDriver: best.driver });
      }

      if (teamRows.length < 4) return null;

      teamRows.sort((a, b) => a.bestLap - b.bestLap);
      const fastest = teamRows[0].bestLap;

      // Q-cutoffs from the all-drivers ranking. 15th best ≈ Q1 boundary
      // (top 15 advance), 10th best ≈ Q2 boundary (top 10 advance).
      const allBestLaps = Object.values(bestByDriver).sort((a, b) => a - b);
      const q1Cutoff = allBestLaps[14];
      const q2Cutoff = allBestLaps[9];

      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        fastestTeamBest: +fastest.toFixed(3),
        teams: teamRows.map(t => ({
          team: t.team,
          bestLap: +t.bestLap.toFixed(3),
          bestDriver: t.bestDriver,
          gapToFastest: +(t.bestLap - fastest).toFixed(3),
        })),
        ...(q1Cutoff != null ? {
          q1Cutoff: +q1Cutoff.toFixed(3),
          q1CutoffGap: +(q1Cutoff - fastest).toFixed(3),
        } : {}),
        ...(q2Cutoff != null ? {
          q2Cutoff: +q2Cutoff.toFixed(3),
          q2CutoffGap: +(q2Cutoff - fastest).toFixed(3),
        } : {}),
      };
    })
    .filter((x): x is ConstructorQualifyingRace => !!x);
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
  constructorQualifying?: ConstructorQualifyingRace[]; // optional — older artifacts may not have this
  teammateGap: TeammateGapRace[];
  tireDeg: TireDegRace[];
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
  };
}
