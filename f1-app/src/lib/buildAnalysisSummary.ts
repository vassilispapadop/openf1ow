import type { Driver, Lap, Stint, Pit, Weather } from "./types";
import { median, linearSlope, computeSlowLapThreshold, isCleanLap, FUEL_TOTAL_KG, FUEL_SEC_PER_KG, DIRTY_AIR_THRESHOLD } from "./raceUtils";
import { ft3 as ft } from "./format";

// --- Summary builders ---

function buildPaceRanking(allLaps: Lap[], drivers: Driver[], threshold: number) {
  const lapMap: Record<number, Lap[]> = {};
  allLaps.forEach(l => {
    if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
    lapMap[l.driver_number].push(l);
  });

  const rankings = drivers.map(d => {
    const clean = (lapMap[d.driver_number] || []).filter(l => isCleanLap(l, threshold));
    if (clean.length < 3) return null;
    const times = clean.map(l => l.lap_duration!).sort((a, b) => a - b);
    const med = median(times);
    return { driver: d.name_acronym, team: d.team_name, medianPace: ft(med), bestLap: ft(times[0]), cleanLaps: clean.length, _med: med };
  }).filter(Boolean) as { driver: string; team: string; medianPace: string; bestLap: string; cleanLaps: number; _med: number }[];

  rankings.sort((a, b) => a._med - b._med);
  const fastest = rankings[0]?._med || 0;

  return rankings.map(({ _med, ...r }) => ({
    ...r,
    gapToLeader: _med === fastest ? "0.000s" : "+" + (_med - fastest).toFixed(3) + "s",
  }));
}

function buildConstructorPace(allLaps: Lap[], drivers: Driver[], threshold: number) {
  const teamMap: Record<string, Driver[]> = {};
  drivers.forEach(d => {
    const t = d.team_name || "Unknown";
    if (!teamMap[t]) teamMap[t] = [];
    teamMap[t].push(d);
  });

  const lapMap: Record<number, Lap[]> = {};
  allLaps.forEach(l => {
    if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
    lapMap[l.driver_number].push(l);
  });

  const teams = Object.entries(teamMap).map(([team, tDrivers]) => {
    const allClean: number[] = [];
    const driverStats = tDrivers.map(d => {
      const clean = (lapMap[d.driver_number] || []).filter(l => isCleanLap(l, threshold)).map(l => l.lap_duration!);
      allClean.push(...clean);
      if (clean.length < 3) return null;
      return { name: d.name_acronym, median: ft(median(clean)) };
    }).filter(Boolean);

    if (allClean.length < 5) return null;
    const teamAvg = median(allClean);
    return { team, medianPace: ft(teamAvg), drivers: driverStats, _med: teamAvg };
  }).filter(Boolean) as { team: string; medianPace: string; drivers: unknown[]; _med: number }[];

  teams.sort((a, b) => a._med - b._med);
  const fastest = teams[0]?._med || 0;

  return teams.map(({ _med, ...t }) => ({
    ...t,
    gapToLeader: _med === fastest ? "0.000s" : "+" + (_med - fastest).toFixed(3) + "s",
  }));
}

function buildTireDegradation(allLaps: Lap[], drivers: Driver[], stints: Stint[], threshold: number) {
  const lapMap: Record<string, Lap> = {};
  allLaps.forEach(l => { lapMap[l.driver_number + "-" + l.lap_number] = l; });

  const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
  const fuelPerLap = FUEL_TOTAL_KG / totalRaceLaps;
  const fuelCorrectionPerLap = fuelPerLap * FUEL_SEC_PER_KG;

  const stintRows = stints.map(st => {
    const drv = drivers.find(d => d.driver_number === st.driver_number);
    if (!drv) return null;

    const allStintLaps: Lap[] = [];
    for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
      const l = lapMap[st.driver_number + "-" + ln];
      if (l && isCleanLap(l, threshold)) allStintLaps.push(l);
    }
    // Drop the first two laps of the stint (tyre warm-up) by tyre age,
    // not by clean-lap index — otherwise dirty early laps push the cutoff deeper.
    const usable = allStintLaps.filter(l => l.lap_number - st.lap_start >= 2);
    if (usable.length < 3) return null;

    // x = tyre age in laps so gaps from dirty/missing laps don't bias the slope.
    const xs = usable.map(l => l.lap_number - st.lap_start);
    const fuelCorrectedYs = usable.map(l => l.lap_duration! + (l.lap_number - 1) * fuelCorrectionPerLap);
    const deg = Math.max(0, linearSlope(xs, fuelCorrectedYs));

    return {
      driver: drv.name_acronym,
      team: drv.team_name,
      compound: st.compound,
      lapRange: `${st.lap_start}-${st.lap_end}`,
      degPerLap: +deg.toFixed(4),
      stintLaps: allStintLaps.length,
    };
  }).filter(Boolean);

  return stintRows;
}

function buildTeammateGaps(allLaps: Lap[], drivers: Driver[], threshold: number) {
  const teams: Record<string, Driver[]> = {};
  drivers.forEach(d => {
    const t = d.team_name || "Unknown";
    if (!teams[t]) teams[t] = [];
    teams[t].push(d);
  });

  const lapMap: Record<number, Lap[]> = {};
  allLaps.forEach(l => {
    if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
    lapMap[l.driver_number].push(l);
  });

  return Object.entries(teams)
    .filter(([, ds]) => ds.length >= 2)
    .map(([team, ds]) => {
      const [d1, d2] = ds.slice(0, 2);
      const laps1 = (lapMap[d1.driver_number] || []).filter(l => isCleanLap(l, threshold));
      const laps2 = (lapMap[d2.driver_number] || []).filter(l => isCleanLap(l, threshold));

      // Find laps where both drivers have clean times
      const l1Map: Record<number, number> = {};
      laps1.forEach(l => { l1Map[l.lap_number] = l.lap_duration!; });
      const times1: number[] = [];
      const times2: number[] = [];
      laps2.forEach(l => {
        if (l1Map[l.lap_number]) {
          times1.push(l1Map[l.lap_number]);
          times2.push(l.lap_duration!);
        }
      });

      if (times1.length < 3) return null;
      const med1 = median(times1);
      const med2 = median(times2);
      const d1Faster = med1 <= med2;

      return {
        team,
        faster: d1Faster ? d1.name_acronym : d2.name_acronym,
        slower: d1Faster ? d2.name_acronym : d1.name_acronym,
        gap: Math.abs(med1 - med2).toFixed(3) + "s",
        commonLaps: times1.length,
      };
    }).filter(Boolean);
}

function buildPitStops(pits: Pit[], drivers: Driver[]) {
  const drvMap: Record<number, Driver> = {};
  drivers.forEach(d => { drvMap[d.driver_number] = d; });

  // Pick ONE duration field for the whole dataset so comparisons are apples-to-apples.
  // Prefer pit_duration (full pit lane time), fall back only if no stops have it.
  const hasPit = pits.some(p => p.pit_duration);
  const hasLane = pits.some(p => p.lane_duration);
  const pickDuration = (p: Pit): number | null =>
    (hasPit ? p.pit_duration : hasLane ? p.lane_duration : p.stop_duration) ?? null;

  const byTeam: Record<string, number[]> = {};
  pits.forEach(p => {
    const d = drvMap[p.driver_number];
    if (!d) return;
    const team = d.team_name || "Unknown";
    if (!byTeam[team]) byTeam[team] = [];
    const dur = pickDuration(p);
    if (dur) byTeam[team].push(dur);
  });

  return Object.entries(byTeam)
    .map(([team, durations]) => {
      if (!durations.length) return null;
      const med = median(durations);
      return {
        team,
        stops: durations.length,
        medianDuration: med.toFixed(2) + "s",
        bestDuration: Math.min(...durations).toFixed(2) + "s",
        _med: med,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a._med - b._med)
    .map(({ _med, ...rest }) => rest);
}

function buildDirtyAir(allLaps: Lap[], drivers: Driver[], _stints: Stint[], threshold: number) {
  // Group laps by lap number, pre-convert dates to timestamps
  const lapsByNumber: Record<number, { lap: Lap; ts: number }[]> = {};
  allLaps.forEach(l => {
    if (!l.date_start) return;
    if (!lapsByNumber[l.lap_number]) lapsByNumber[l.lap_number] = [];
    lapsByNumber[l.lap_number].push({ lap: l, ts: new Date(l.date_start).getTime() });
  });

  // Compute gaps and classify laps
  const driverData: Record<number, { free: number[]; dirty: number[] }> = {};
  drivers.forEach(d => { driverData[d.driver_number] = { free: [], dirty: [] }; });

  for (const [, entries] of Object.entries(lapsByNumber)) {
    const sorted = entries.sort((a, b) => a.ts - b.ts);

    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i].lap;
      if (!l.lap_duration || l.lap_duration <= 0 || l.is_pit_out_lap || l.lap_number <= 1) continue;
      if (!isCleanLap(l, threshold)) continue;

      const gap = i > 0 ? (sorted[i].ts - sorted[i - 1].ts) / 1000 : 999;

      const dd = driverData[l.driver_number];
      if (!dd) continue;

      if (gap < DIRTY_AIR_THRESHOLD) {
        dd.dirty.push(l.lap_duration);
      } else {
        dd.free.push(l.lap_duration);
      }
    }
  }

  return drivers
    .map(d => {
      const dd = driverData[d.driver_number];
      if (!dd || (dd.free.length + dd.dirty.length) < 5) return null;
      const freeMed = dd.free.length >= 3 ? median(dd.free) : null;
      const dirtyMed = dd.dirty.length >= 3 ? median(dd.dirty) : null;
      const timeLoss = freeMed && dirtyMed ? (dirtyMed - freeMed).toFixed(3) : null;
      return {
        driver: d.name_acronym,
        team: d.team_name,
        cleanLaps: dd.free.length,
        dirtyLaps: dd.dirty.length,
        pctInCleanAir: Math.round((dd.free.length / (dd.free.length + dd.dirty.length)) * 100),
        timeLossPerLapInTraffic: timeLoss ? timeLoss + "s" : "N/A",
      };
    })
    .filter(Boolean);
}

function buildWeatherSummary(weather: Weather[]) {
  if (!weather.length) return null;
  const first = weather[0];
  const last = weather[weather.length - 1];
  const trackTemps = weather.map(w => w.track_temperature);
  const airTemps = weather.map(w => w.air_temperature);
  return {
    trackTempRange: Math.min(...trackTemps).toFixed(0) + "-" + Math.max(...trackTemps).toFixed(0) + "°C",
    airTempRange: Math.min(...airTemps).toFixed(0) + "-" + Math.max(...airTemps).toFixed(0) + "°C",
    trackTempDelta: +(last.track_temperature - first.track_temperature).toFixed(1),
    hadRain: weather.some(w => w.rainfall),
    avgHumidity: +(weather.reduce((s, w) => s + w.humidity, 0) / weather.length).toFixed(0),
    avgWindSpeed: +(weather.reduce((s, w) => s + w.wind_speed, 0) / weather.length).toFixed(1),
  };
}

function buildRaceControlSummary(rc: { flag?: string; category?: string; message?: string; date?: string }[]) {
  // Only include significant events
  const significant = rc.filter(r =>
    r.flag === "RED" || r.flag === "YELLOW" || r.flag === "DOUBLE YELLOW" ||
    r.category === "SafetyCar" || r.category === "Flag" ||
    (r.message && (r.message.includes("PENALTY") || r.message.includes("INVESTIGATION") ||
     r.message.includes("SAFETY CAR") || r.message.includes("RED FLAG") ||
     r.message.includes("VSC") || r.message.includes("RETIRED")))
  );
  return significant.slice(0, 20).map(r => ({
    flag: r.flag || "",
    category: r.category || "",
    message: r.message || "",
  }));
}

function buildResultsSummary(results: { position?: number; driver_number?: number; full_name?: string; time?: string; gap_to_leader?: string; status?: string }[], drivers: Driver[]) {
  const drvMap: Record<number, Driver> = {};
  drivers.forEach(d => { drvMap[d.driver_number] = d; });

  return results.slice(0, 20).map(r => {
    const d = r.driver_number ? drvMap[r.driver_number] : null;
    return {
      position: r.position,
      driver: d?.name_acronym || d?.full_name || "Unknown",
      team: d?.team_name || "",
      gap: r.gap_to_leader || "",
      status: r.status || "Finished",
    };
  });
}

function buildSectorAnalysis(allLaps: Lap[], drivers: Driver[], threshold: number) {
  // Find global best sectors
  const allS1: number[] = [], allS2: number[] = [], allS3: number[] = [];
  allLaps.forEach(l => {
    if (!isCleanLap(l, threshold)) return;
    if (l.duration_sector_1 != null) allS1.push(l.duration_sector_1);
    if (l.duration_sector_2 != null) allS2.push(l.duration_sector_2);
    if (l.duration_sector_3 != null) allS3.push(l.duration_sector_3);
  });
  const bestS1 = allS1.length ? Math.min(...allS1) : 0;
  const bestS2 = allS2.length ? Math.min(...allS2) : 0;
  const bestS3 = allS3.length ? Math.min(...allS3) : 0;

  // Per-driver sector breakdown
  const byDriver: Record<number, { s1: number[]; s2: number[]; s3: number[] }> = {};
  allLaps.forEach(l => {
    if (!isCleanLap(l, threshold)) return;
    if (l.duration_sector_1 == null || l.duration_sector_2 == null || l.duration_sector_3 == null) return;
    if (!byDriver[l.driver_number]) byDriver[l.driver_number] = { s1: [], s2: [], s3: [] };
    byDriver[l.driver_number].s1.push(l.duration_sector_1);
    byDriver[l.driver_number].s2.push(l.duration_sector_2);
    byDriver[l.driver_number].s3.push(l.duration_sector_3);
  });

  const entries = drivers.map(d => {
    const dd = byDriver[d.driver_number];
    if (!dd || dd.s1.length < 3) return null;
    const medS1 = median(dd.s1), medS2 = median(dd.s2), medS3 = median(dd.s3);
    const theoretical = Math.min(...dd.s1) + Math.min(...dd.s2) + Math.min(...dd.s3);
    return {
      driver: d.name_acronym,
      team: d.team_name,
      bestS1: ft(Math.min(...dd.s1)),
      bestS2: ft(Math.min(...dd.s2)),
      bestS3: ft(Math.min(...dd.s3)),
      medianS1: ft(medS1),
      medianS2: ft(medS2),
      medianS3: ft(medS3),
      deltaS1: "+" + (medS1 - bestS1).toFixed(3),
      deltaS2: "+" + (medS2 - bestS2).toFixed(3),
      deltaS3: "+" + (medS3 - bestS3).toFixed(3),
      theoreticalBest: ft(theoretical),
      _total: medS1 + medS2 + medS3,
    };
  }).filter((e): e is NonNullable<typeof e> => e !== null);

  entries.sort((a, b) => a._total - b._total);
  return {
    sessionBestS1: ft(bestS1),
    sessionBestS2: ft(bestS2),
    sessionBestS3: ft(bestS3),
    drivers: entries.map(({ _total, ...rest }) => rest),
  };
}

function buildTopSpeeds(allLaps: Lap[], drivers: Driver[], threshold: number) {
  const byDriver: Record<number, { st: number[]; i1: number[]; i2: number[] }> = {};
  allLaps.forEach(l => {
    if (!isCleanLap(l, threshold)) return;
    if (!byDriver[l.driver_number]) byDriver[l.driver_number] = { st: [], i1: [], i2: [] };
    if (l.st_speed != null && l.st_speed > 0) byDriver[l.driver_number].st.push(l.st_speed);
    if (l.i1_speed != null && l.i1_speed > 0) byDriver[l.driver_number].i1.push(l.i1_speed);
    if (l.i2_speed != null && l.i2_speed > 0) byDriver[l.driver_number].i2.push(l.i2_speed);
  });

  const entries = drivers.map(d => {
    const dd = byDriver[d.driver_number];
    if (!dd || dd.st.length < 3) return null;
    const maxST = Math.max(...dd.st);
    return {
      driver: d.name_acronym,
      team: d.team_name,
      maxSpeedTrap: maxST,
      medianSpeedTrap: Math.round(median(dd.st)),
      maxI1: dd.i1.length ? Math.max(...dd.i1) : null,
      maxI2: dd.i2.length ? Math.max(...dd.i2) : null,
      _max: maxST,
    };
  }).filter((e): e is NonNullable<typeof e> => e !== null);

  entries.sort((a, b) => b._max - a._max);
  return entries.map(({ _max, ...rest }) => rest);
}

// --- Main export ---

export interface RaceSummaryInput {
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  pits: Pit[];
  weather: Weather[];
  raceControl: { flag?: string; category?: string; message?: string; date?: string }[];
  results: { position?: number; driver_number?: number; full_name?: string; time?: string; gap_to_leader?: string; status?: string }[];
  clippingSummary?: { driver: string; team: string; clipCount: number; totalSpeedLost: number; worstDrop: number; avgSpeedDrop: number }[];
}

export function buildFullSummary(input: RaceSummaryInput) {
  const { allLaps, drivers, stints, pits, weather, raceControl, results, clippingSummary } = input;
  const threshold = computeSlowLapThreshold(allLaps);

  return {
    meta: {
      totalLaps: Math.max(...allLaps.map(l => l.lap_number), 0),
      driverCount: new Set(allLaps.map(l => l.driver_number)).size,
      totalLapRecords: allLaps.length,
    },
    paceRanking: buildPaceRanking(allLaps, drivers, threshold),
    constructorPace: buildConstructorPace(allLaps, drivers, threshold),
    tireDegradation: buildTireDegradation(allLaps, drivers, stints, threshold),
    teammateGaps: buildTeammateGaps(allLaps, drivers, threshold),
    pitStops: buildPitStops(pits, drivers),
    dirtyAir: buildDirtyAir(allLaps, drivers, stints, threshold),
    sectorAnalysis: buildSectorAnalysis(allLaps, drivers, threshold),
    topSpeeds: buildTopSpeeds(allLaps, drivers, threshold),
    ...(clippingSummary?.length ? { clippingSummary } : {}),
    weather: buildWeatherSummary(weather),
    raceControl: buildRaceControlSummary(raceControl),
    results: buildResultsSummary(results, drivers),
  };
}
