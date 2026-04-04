// Pure functions to build a compact race summary for LLM analysis.
// Mirrors the computation logic from RaceAnalysis.tsx but outputs JSON, not React elements.

interface Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
}

interface Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  date_start: string;
  st_speed: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
}

interface Stint {
  driver_number: number;
  stint_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  tyre_age_at_start: number;
}

interface Pit {
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  stop_duration: number | null;
  lane_duration: number | null;
  date: string;
}

interface Weather {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: boolean;
  wind_speed: number;
  wind_direction: number | null;
}

// --- Shared helpers (same as RaceAnalysis.tsx) ---

const FUEL_TOTAL_KG = 110;
const FUEL_SEC_PER_KG = 0.055;
const SLOW_LAP_FACTOR = 1.07;
const DIRTY_AIR_THRESHOLD = 1.5;

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function linearSlope(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const n = xs.length;
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  return den ? num / den : 0;
}

function computeSlowLapThreshold(allLaps: Lap[]): number {
  const validTimes = allLaps
    .filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1)
    .map(l => l.lap_duration!);
  if (!validTimes.length) return Infinity;
  return median(validTimes) * SLOW_LAP_FACTOR;
}

function isCleanLap(l: Lap, threshold: number): boolean {
  return !!(l.lap_duration && l.lap_duration > 0 && l.lap_duration < threshold && !l.is_pit_out_lap && l.lap_number > 1);
}

function ft(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(3);
  return m > 0 ? m + ":" + r.padStart(6, "0") : r + "s";
}

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
    return { driver: d.name_acronym, team: d.team_name, medianPace: ft(median(times)), bestLap: ft(times[0]), cleanLaps: clean.length, _med: median(times) };
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
    const usable = allStintLaps.slice(2);
    if (usable.length < 3) return null;

    const xs = usable.map((_, i) => i);
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

  const byTeam: Record<string, number[]> = {};
  pits.forEach(p => {
    const d = drvMap[p.driver_number];
    if (!d) return;
    const team = d.team_name || "Unknown";
    if (!byTeam[team]) byTeam[team] = [];
    const dur = p.pit_duration || p.lane_duration || p.stop_duration;
    if (dur) byTeam[team].push(dur);
  });

  return Object.entries(byTeam)
    .map(([team, durations]) => {
      if (!durations.length) return null;
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      return {
        team,
        stops: durations.length,
        avgDuration: avg.toFixed(2) + "s",
        bestDuration: Math.min(...durations).toFixed(2) + "s",
        _avg: avg,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a._avg - b._avg)
    .map(({ _avg, ...rest }) => rest);
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

// --- Main export ---

export interface RaceSummaryInput {
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  pits: Pit[];
  weather: Weather[];
  raceControl: { flag?: string; category?: string; message?: string; date?: string }[];
  results: { position?: number; driver_number?: number; full_name?: string; time?: string; gap_to_leader?: string; status?: string }[];
}

export function buildFullSummary(input: RaceSummaryInput) {
  const { allLaps, drivers, stints, pits, weather, raceControl, results } = input;
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
    weather: buildWeatherSummary(weather),
    raceControl: buildRaceControlSummary(raceControl),
    results: buildResultsSummary(results, drivers),
  };
}
