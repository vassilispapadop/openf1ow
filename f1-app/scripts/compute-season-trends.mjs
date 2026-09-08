#!/usr/bin/env node
/**
 * Builds season-trends/{year}.json and uploads to R2. Math is duplicated
 * from src/lib/{raceUtils,seasonUtils}.ts because Node ESM can't import
 * .ts directly here — keep the two in sync if you change either.
 *
 * The corner/straight aggregation is the exception to the duplication rule
 * above: it imports lib/lapSegments.ts and lib/telemetry.ts directly, since
 * Node strips the type annotations natively and those two modules are pure
 * functions with no DOM or React dependency. Re-deriving several hundred lines
 * of segmentation maths here would be far more likely to drift.
 *
 * Usage:
 *   node scripts/compute-season-trends.mjs                # all years
 *   node scripts/compute-season-trends.mjs --year 2025
 *   node scripts/compute-season-trends.mjs --dry-run      # no R2 write
 *   node scripts/compute-season-trends.mjs --skip-corners # no telemetry pass
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compareLapSegments } from "../src/lib/lapSegments.ts";
import { mergeDistance } from "../src/lib/telemetry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RACE_INDEX = join(REPO_ROOT, "public", "race-index.json");
const CACHE_DIR = join(__dirname, ".cache-trends");
const BUCKET = "openf1-data";
const API = "https://api.openf1.org/v1";
const FETCH_DELAY_MS = 200;

// CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// The corner/straight pass is the only one that fetches telemetry, and it's
// two orders of magnitude more requests than everything else combined. Skip it
// when you just want the lap-time aggregations refreshed.
const skipCorners = args.includes("--skip-corners");
const yearIdx = args.indexOf("--year");
const targetYear = yearIdx >= 0 ? Number(args[yearIdx + 1]) : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Math primitives — mirror src/lib/raceUtils.ts.

const FUEL_TOTAL_KG = 110;
// Sprint races (~24 laps) are fuelled for ~40 kg, not 110. Without this,
// fuel-corrected tyre deg on sprints is over-corrected ~2.7× and reported
// 50-150% higher than reality. Mirror src/lib/raceUtils.ts.
const FUEL_SPRINT_KG = 40;
const SPRINT_LAP_THRESHOLD = 30;
const FUEL_SEC_PER_KG = 0.055;
const SLOW_LAP_FACTOR = 1.07;

function inferStartFuelKg(totalLaps) {
  return totalLaps > 0 && totalLaps <= SPRINT_LAP_THRESHOLD ? FUEL_SPRINT_KG : FUEL_TOTAL_KG;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function linearSlope(xs, ys) {
  if (xs.length < 2) return 0;
  const n = xs.length;
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  return den ? num / den : 0;
}

function computeSlowLapThreshold(laps) {
  const valid = laps
    .filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1)
    .map(l => l.lap_duration);
  if (!valid.length) return Infinity;
  return median(valid) * SLOW_LAP_FACTOR;
}

function isCleanLap(l, threshold) {
  return !!(l.lap_duration && l.lap_duration > 0 && l.lap_duration < threshold && !l.is_pit_out_lap && l.lap_number > 1);
}

function fuelCorrPerLap(totalLaps) {
  return (inferStartFuelKg(totalLaps) / Math.max(1, totalLaps)) * FUEL_SEC_PER_KG;
}

function stintDegradation(stint, lapLookup, threshold, fc) {
  const usable = [];
  for (let ln = stint.lap_start + 2; ln <= stint.lap_end; ln++) {
    const l = lapLookup[stint.driver_number + "-" + ln];
    if (l && isCleanLap(l, threshold)) usable.push(l);
  }
  if (usable.length < 3) return null;
  const xs = usable.map(l => l.lap_number - stint.lap_start);
  const ys = usable.map(l => l.lap_duration + (l.lap_number - 1) * fc);
  return Math.max(0, linearSlope(xs, ys));
}

// Aggregators — mirror src/lib/seasonUtils.ts.

function paceByDriver(laps, drivers) {
  const threshold = computeSlowLapThreshold(laps);
  if (!isFinite(threshold)) return [];
  const byDriver = {};
  for (const l of laps) {
    if (!isCleanLap(l, threshold)) continue;
    (byDriver[l.driver_number] ||= []).push(l.lap_duration);
  }
  return drivers
    .map(d => {
      const t = byDriver[d.driver_number];
      if (!t || t.length < 3) return null;
      t.sort((a, b) => a - b);
      return { driver: d.name_acronym, team: d.team_name, medianPace: median(t) };
    })
    .filter(Boolean);
}

function aggregateConstructorPaceByRace(races) {
  return races
    .map(r => {
      const rows = paceByDriver(r.laps, r.drivers);
      if (rows.length < 4) return null;
      const byTeam = {};
      for (const row of rows) {
        const t = row.team || "Unknown";
        (byTeam[t] ||= []).push(row.medianPace);
      }
      const teamRows = Object.entries(byTeam)
        .filter(([, paces]) => paces.length > 0)
        .map(([team, paces]) => ({ team, medianPace: median(paces), drivers: paces.length }));
      if (!teamRows.length) return null;
      teamRows.sort((a, b) => a.medianPace - b.medianPace);
      const fastest = teamRows[0].medianPace;
      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        fastestTeamMedian: +fastest.toFixed(3),
        teams: teamRows.map(t => ({
          team: t.team,
          medianPace: +t.medianPace.toFixed(3),
          gapToFastest: +(t.medianPace - fastest).toFixed(3),
          drivers: t.drivers,
        })),
      };
    })
    .filter(Boolean);
}

// Constructor qualifying: best clean push lap of the team's faster driver
// becomes the "constructor's" qualifying time. Gap to fastest team is the
// metric. Mirrors aggregateConstructorPaceByRace but on quali laps.
function aggregateConstructorQualifyingByRace(races) {
  return races
    .map(r => {
      const laps = r.qualiLaps?.length ? r.qualiLaps : null;
      if (!laps) return null;
      const threshold = computeSlowLapThreshold(laps);
      if (!isFinite(threshold)) return null;

      const cleanByDriver = {};
      for (const l of laps) {
        if (!isCleanLap(l, threshold)) continue;
        (cleanByDriver[l.driver_number] ||= []).push(l.lap_duration);
      }

      const bestByDriver = {};
      for (const [num, ls] of Object.entries(cleanByDriver)) {
        if (ls.length < 2) continue;
        bestByDriver[Number(num)] = Math.min(...ls);
      }

      const teamByDriver = {};
      for (const d of r.drivers) {
        const t = d.team_name || "Unknown";
        (teamByDriver[t] ||= []).push(d);
      }

      const teamRows = [];
      for (const [team, drivers] of Object.entries(teamByDriver)) {
        let best = null;
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

      // Q-cutoffs from the all-drivers ranking: 15th-best ≈ Q1 boundary,
      // 10th-best ≈ Q2 boundary.
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
    .filter(Boolean);
}

// Teammate gap measured from QUALIFYING best laps, not race medians.
// Race-pace teammate gaps are dominated by traffic/pit-stop variance —
// qualifying is the clean head-to-head (same car, same track, push lap).
//
// For each team: take each driver's best clean qualifying lap, compare.
// "commonLaps" here is repurposed as min(quali laps completed) so users
// can sense the data quality (e.g. 3 quali laps = Q1 elimination).
function aggregateTeammateGapTrend(races) {
  return races
    .map(r => {
      // Use qualiLaps when present; fall back to race laps if a session
      // genuinely has no qualifying data (e.g. cancelled qualifying).
      const lapsForGap = r.qualiLaps?.length ? r.qualiLaps : r.laps;
      if (!lapsForGap?.length) return null;
      const threshold = computeSlowLapThreshold(lapsForGap);
      if (!isFinite(threshold)) return null;

      const teamDrivers = {};
      for (const d of r.drivers) {
        const t = d.team_name || "Unknown";
        (teamDrivers[t] ||= []).push(d);
      }
      const byDriver = {};
      for (const l of lapsForGap) {
        if (!isCleanLap(l, threshold)) continue;
        (byDriver[l.driver_number] ||= []).push(l.lap_duration);
      }

      const teamRows = [];
      for (const [team, ds] of Object.entries(teamDrivers)) {
        if (ds.length < 2) continue;
        const [d1, d2] = ds.slice(0, 2);
        const t1 = byDriver[d1.driver_number] || [];
        const t2 = byDriver[d2.driver_number] || [];
        // Require 2+ clean push laps from each teammate. With only 1
        // clean lap the "best" might be an aborted lap rather than
        // a true representative of pace.
        if (t1.length < 2 || t2.length < 2) continue;
        const best1 = Math.min(...t1);
        const best2 = Math.min(...t2);
        const d1Faster = best1 <= best2;
        teamRows.push({
          team,
          faster: d1Faster ? d1.name_acronym : d2.name_acronym,
          slower: d1Faster ? d2.name_acronym : d1.name_acronym,
          gap: +Math.abs(best1 - best2).toFixed(3),
          commonLaps: Math.min(t1.length, t2.length),
        });
      }
      if (!teamRows.length) return null;
      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        teams: teamRows.sort((a, b) => b.gap - a.gap),
      };
    })
    .filter(Boolean);
}

function aggregateTireDegByCompound(races) {
  return races
    .map(r => {
      const threshold = computeSlowLapThreshold(r.laps);
      if (!isFinite(threshold)) return null;
      const totalLaps = r.laps.reduce((m, l) => Math.max(m, l.lap_number), 0);
      if (totalLaps < 5) return null;
      const fc = fuelCorrPerLap(totalLaps);
      const lapLookup = {};
      for (const l of r.laps) lapLookup[l.driver_number + "-" + l.lap_number] = l;

      const byCompound = {};
      for (const st of r.stints) {
        const deg = stintDegradation(st, lapLookup, threshold, fc);
        if (deg == null) continue;
        const c = (st.compound || "UNKNOWN").toUpperCase();
        (byCompound[c] ||= []).push(deg);
      }
      const compounds = Object.entries(byCompound)
        .filter(([, vals]) => vals.length > 0)
        .map(([compound, vals]) => ({
          compound,
          medianDeg: +median(vals).toFixed(4),
          stints: vals.length,
        }))
        .sort((a, b) => a.compound.localeCompare(b.compound));
      if (!compounds.length) return null;
      return {
        meetingKey: r.meta.meetingKey,
        slug: r.meta.slug,
        meetingName: r.meta.meetingName,
        dateStart: r.meta.dateStart,
        round: r.meta.round,
        compounds,
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Corner / straight balance (telemetry pass)
// ---------------------------------------------------------------------------

/** Extra slack fetched past the flag so the lap's last sample isn't clipped;
 *  compareLapSegments trims back to the exact lap. */
const TELEMETRY_TAIL_MS = 2000;
/** Telemetry endpoints rate-limit harder than the session ones. */
const TELEMETRY_DELAY_MS = 900;

function telemetryCachePath(sk, driverNumber, lapNumber) {
  return join(CACHE_DIR, `tel_${sk}_${driverNumber}_${lapNumber}.json`);
}

async function fetchTelemetryRange(endpoint, sk, driverNumber, startIso, endIso) {
  const q = `session_key=${sk}&driver_number=${driverNumber}&date>=${startIso}&date<=${endIso}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${API}/${endpoint}?${q}`);
      if (res.ok) return await res.json();
      // 422 means the query itself is malformed — retrying won't help.
      if (res.status === 422) {
        console.warn(`\n    ${endpoint} 422 for #${driverNumber} — ${q}`);
        return null;
      }
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await sleep(900 * (attempt + 1));
  }
  return null;
}

/** car_data + location for one lap, merged into distance-stamped samples.
 *  Cached on disk keyed by session/driver/lap — a season's telemetry is a few
 *  hundred fetches, so a re-run should never pay for them twice. */
async function fetchLapTelemetry(sk, driverNumber, lap) {
  const cached = telemetryCachePath(sk, driverNumber, lap.lap_number);
  if (existsSync(cached)) {
    const data = JSON.parse(readFileSync(cached, "utf-8"));
    if (Array.isArray(data) && data.length > 0) return data;
  }
  // OpenF1 rejects the raw "+00:00" offset that comes back on date_start with
  // a 422; normalise both bounds to ISO-Z.
  const startIso = new Date(lap.date_start).toISOString();
  const endIso = new Date(new Date(lap.date_start).getTime() + lap.lap_duration * 1000 + TELEMETRY_TAIL_MS).toISOString();

  const cd = await fetchTelemetryRange("car_data", sk, driverNumber, startIso, endIso);
  if (!cd?.length) return null;
  await sleep(TELEMETRY_DELAY_MS);
  const loc = await fetchTelemetryRange("location", sk, driverNumber, startIso, endIso);

  const merged = mergeDistance(cd, loc || []);
  // Without location data every sample sits at distance 0 and the segmentation
  // has nothing to cut on, so don't cache a useless result.
  if (!merged.length || !merged.some(p => (p.distance ?? 0) > 0)) return null;
  writeFileSync(cached, JSON.stringify(merged));
  return merged;
}

/** Each team's fastest clean qualifying lap, as {team, driver, lap}. */
function bestQualiLapPerTeam(race) {
  const laps = race.qualiLaps;
  if (!laps?.length) return [];
  const threshold = computeSlowLapThreshold(laps);
  if (!isFinite(threshold)) return [];

  const teamOf = {};
  const acronymOf = {};
  for (const d of race.drivers) {
    teamOf[d.driver_number] = d.team_name || "Unknown";
    acronymOf[d.driver_number] = d.name_acronym || String(d.driver_number);
  }

  const best = {};
  for (const l of laps) {
    if (!isCleanLap(l, threshold)) continue;
    // Segmentation needs a start timestamp and a duration to pin the window.
    if (!l.date_start || !l.lap_duration) continue;
    const team = teamOf[l.driver_number];
    if (!team) continue;
    const cur = best[team];
    if (!cur || l.lap_duration < cur.lap.lap_duration) {
      best[team] = { team, driver: acronymOf[l.driver_number], driverNumber: l.driver_number, lap: l };
    }
  }
  return Object.values(best).sort((a, b) => a.lap.lap_duration - b.lap.lap_duration);
}

/** One race's corner/straight decomposition. Returns null when the weekend
 *  has no qualifying telemetry to work with. */
async function cornerStraightForRace(race) {
  const qualiSk = race.meta.qualifyingSessionKey;
  if (!qualiSk) return null;
  const candidates = bestQualiLapPerTeam(race);
  if (candidates.length < 2) return null;

  const traces = [];
  for (const c of candidates) {
    const data = await fetchLapTelemetry(qualiSk, c.driverNumber, c.lap);
    await sleep(TELEMETRY_DELAY_MS);
    if (!data) continue;
    traces.push({
      data,
      color: "888888",              // unused here; the UI colours by team
      label: c.team,
      lap: { dateStart: c.lap.date_start, duration: c.lap.lap_duration },
      driver: c.driver,
      lapTime: c.lap.lap_duration,
    });
  }
  if (traces.length < 2) return null;

  const cmp = compareLapSegments(traces);
  if (!cmp) return null;

  // compareLapSegments picks the quickest lap as its own baseline, which is
  // the team we want everything measured against.
  const byLabel = Object.fromEntries(traces.map(t => [t.label, t]));
  const teams = cmp.totals
    .map(t => ({
      team: t.label,
      driver: byLabel[t.label]?.driver ?? "",
      lapTime: byLabel[t.label]?.lapTime ?? 0,
      cornerTime: round3(t.cornerTime),
      straightTime: round3(t.straightTime),
      cornerGap: round3(t.cornerDelta),
      straightGap: round3(t.straightDelta),
      gapToFastest: round3(t.totalDelta),
    }))
    .sort((a, b) => a.gapToFastest - b.gapToFastest);

  return {
    meetingKey: race.meta.meetingKey,
    slug: race.meta.slug,
    meetingName: race.meta.meetingName,
    dateStart: race.meta.dateStart,
    round: race.meta.round,
    referenceTeam: cmp.baselineLabel,
    cornerCount: cmp.cornerCount,
    straightCount: cmp.straightCount,
    cornerDistance: Math.round(cmp.cornerDistance),
    straightDistance: Math.round(cmp.straightDistance),
    trackDistance: Math.round(cmp.trackDistance),
    teams,
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** The already-published corner/straight rows for a year. Used by
 *  --skip-corners: the upload replaces the whole artifact, so without carrying
 *  these forward a fast rebuild would silently delete the section. */
async function existingCornerStraight(year) {
  try {
    const res = await fetch(`https://www.openf1ow.com/api/season-trends/${year}`);
    if (!res.ok) return [];
    const prev = await res.json();
    return Array.isArray(prev?.cornerStraight) ? prev.cornerStraight : [];
  } catch {
    return [];
  }
}

async function aggregateCornerStraightByRace(races) {
  const out = [];
  for (const race of races) {
    process.stdout.write(`  [corners] ${race.meta.slug.padEnd(20)} `);
    try {
      const row = await cornerStraightForRace(race);
      if (row) {
        out.push(row);
        console.log(`${row.teams.length} teams · ${row.cornerCount}c/${row.straightCount}s · ref ${row.referenceTeam}`);
      } else {
        console.log("(skipped — no usable qualifying telemetry)");
      }
    } catch (e) {
      console.log(`(failed — ${e.message})`);
    }
  }
  return out;
}

function localCachePath(endpoint, sk) {
  return join(CACHE_DIR, `${endpoint}_${sk}.json`);
}

async function fetchEndpoint(endpoint, sk) {
  const cached = localCachePath(endpoint, sk);
  if (existsSync(cached)) {
    const data = JSON.parse(readFileSync(cached, "utf-8"));
    // Don't trust empty cached arrays — they're almost always rate-limit
    // fallout from a previous run. Refetch on next call instead of leaving
    // the artifact permanently incomplete. Real "no data" cases (404) are
    // returned as null, not [], so don't get cached.
    if (!Array.isArray(data) || data.length > 0) return data;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${API}/${endpoint}?session_key=${sk}`);
      if (res.ok) {
        const data = await res.json();
        // Treat empty array as transient on first attempts
        if (Array.isArray(data) && data.length === 0 && attempt < 3) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        // Only cache non-empty responses so we never freeze rate-limit
        // fallout into the local cache.
        if (!Array.isArray(data) || data.length > 0) {
          writeFileSync(cached, JSON.stringify(data));
        }
        return data;
      }
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await sleep(800 * (attempt + 1));
  }
  return null;
}

async function loadRaceData(year, race, round) {
  const sk = race.sessions?.race;
  if (!sk) return null;
  const qualiSk = race.sessions?.qualifying;
  // Sprint weekends — qualifying happens for the Sunday race, sprintqualifying
  // sets the sprint grid. We use the main qualifying for teammate-gap
  // analysis; sprintqualifying could be a future per-session breakdown.
  const [raceDrivers, qualiDrivers, laps, stints, qualiLaps] = await Promise.all([
    fetchEndpoint("drivers", sk),
    qualiSk ? fetchEndpoint("drivers", qualiSk) : Promise.resolve(null),
    fetchEndpoint("laps", sk),
    fetchEndpoint("stints", sk),
    qualiSk ? fetchEndpoint("laps", qualiSk) : Promise.resolve(null),
  ]);
  // Prefer the race-session lineup; fall back to qualifying when the race
  // hasn't been run yet (mid-weekend builds, qualifying done but no race).
  const drivers = raceDrivers?.length ? raceDrivers : qualiDrivers;
  if (!drivers?.length) return null;
  // Accept partial weekends: constructor-pace/tire-deg need race laps;
  // constructor-quali/teammate-gap need quali laps. Each aggregator skips
  // its own missing cases — we just need at least one source.
  if (!laps?.length && !qualiLaps?.length) return null;
  return {
    meta: {
      meetingKey: race.meetingKey,
      slug: race.slug,
      meetingName: race.meetingName,
      country: race.country,
      location: race.location,
      dateStart: race.dateStart,
      round,
      qualifyingSessionKey: qualiSk || null,
    },
    drivers,
    laps: laps || [],
    qualiLaps: qualiLaps || [],
    stints: stints || [],
  };
}

function uploadToR2(year, payload) {
  if (dryRun) {
    const localCopy = join(CACHE_DIR, `_trends-${year}.json`);
    writeFileSync(localCopy, JSON.stringify(payload, null, 2));
    console.log(`  [dry-run] would upload season-trends/${year}.json (${JSON.stringify(payload).length} bytes) — local copy at ${localCopy}`);
    return;
  }
  const tmpPath = join(CACHE_DIR, `_upload-${year}.json`);
  writeFileSync(tmpPath, JSON.stringify(payload));
  try {
    execSync(
      `npx wrangler r2 object put "${BUCKET}/season-trends/${year}.json" --file="${tmpPath}" --content-type="application/json" --remote`,
      { stdio: "inherit", cwd: REPO_ROOT },
    );
    console.log(`  uploaded season-trends/${year}.json`);
  } catch (e) {
    console.error(`  upload failed: ${e.message}`);
  }
}

async function processYear(year, allRaces) {
  console.log(`\n=== ${year} ===`);
  const now = Date.now();
  // Only past races with race session data
  const eligible = allRaces
    .filter(r => r.sessions?.race && r.dateStart && new Date(r.dateStart).getTime() < now)
    .sort((a, b) => (a.dateStart || "").localeCompare(b.dateStart || ""));
  console.log(`  ${eligible.length} eligible races`);

  if (eligible.length === 0) {
    console.log(`  skipping ${year} — no completed races`);
    return;
  }

  const racesData = [];
  for (let i = 0; i < eligible.length; i++) {
    const r = eligible[i];
    const round = i + 1;
    process.stdout.write(`  [${round.toString().padStart(2, " ")}/${eligible.length}] ${r.slug.padEnd(20)} `);
    const data = await loadRaceData(year, r, round);
    if (data) {
      racesData.push(data);
      console.log(`drivers=${data.drivers.length} laps=${data.laps.length} stints=${data.stints.length} quali=${data.qualiLaps.length}`);
    } else {
      console.log("(skipped — incomplete data)");
    }
    await sleep(FETCH_DELAY_MS);
  }

  if (racesData.length === 0) {
    console.log(`  no usable race data for ${year}`);
    return;
  }

  const cornerStraight = skipCorners
    ? await existingCornerStraight(year)
    : await aggregateCornerStraightByRace(racesData);
  if (skipCorners) {
    console.log(`  [corners] skipped — carrying over ${cornerStraight.length} previously published races`);
  }

  const trends = {
    generatedAt: new Date().toISOString(),
    year,
    raceCount: racesData.length,
    constructorPace: aggregateConstructorPaceByRace(racesData),
    constructorQualifying: aggregateConstructorQualifyingByRace(racesData),
    teammateGap: aggregateTeammateGapTrend(racesData),
    tireDeg: aggregateTireDegByCompound(racesData),
  };
  if (cornerStraight.length) trends.cornerStraight = cornerStraight;

  console.log(`  built trends: cp=${trends.constructorPace.length} cq=${trends.constructorQualifying.length} tg=${trends.teammateGap.length} td=${trends.tireDeg.length} cs=${cornerStraight.length}`);
  uploadToR2(year, trends);
}

async function main() {
  if (!existsSync(RACE_INDEX)) {
    console.error(`race-index.json not found at ${RACE_INDEX}`);
    console.error(`run npm run race-index first`);
    process.exit(1);
  }
  mkdirSync(CACHE_DIR, { recursive: true });

  const idx = JSON.parse(readFileSync(RACE_INDEX, "utf-8"));
  const years = targetYear ? [String(targetYear)] : Object.keys(idx.byYear).sort();

  console.log(`Years: ${years.join(", ")}${dryRun ? " [DRY RUN]" : ""}`);
  for (const y of years) {
    if (!idx.byYear[y]) {
      console.log(`  no race-index entries for ${y}, skipping`);
      continue;
    }
    await processYear(Number(y), idx.byYear[y]);
  }
  console.log("\n=== Done ===");
}

main().catch(e => { console.error(e); process.exit(1); });
