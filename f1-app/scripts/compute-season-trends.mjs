#!/usr/bin/env node
/**
 * Builds season-trends/{year}.json and uploads to R2. All the maths comes
 * from src/engine (via src/lib/seasonUtils.ts), imported as TypeScript —
 * Node strips the annotations natively and the engine has no DOM or React
 * dependency — so the season page, the race page and this script share one
 * definition of a clean lap, a degradation slope and a teammate gap.
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
import { compareLapSegments } from "../src/engine/telemetry/lapSegments.ts";
import { mergeDistance } from "../src/engine/telemetry/telemetry.ts";
import { eligibleForBest } from "../src/engine/index.ts";
import {
  aggregateConstructorPaceByRace,
  aggregateConstructorQualifyingByRace,
  aggregateTeammateGapTrend,
  aggregateTireDegByCompound,
  qualiModel,
} from "../src/lib/seasonUtils.ts";

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

/** Each team's fastest qualifying lap, as {team, driver, lap}, under the
 *  engine's one definition of an eligible best lap (timed, not a pit-out,
 *  not lap 1, not under a red flag). */
function bestQualiLapPerTeam(race) {
  const model = qualiModel(race);
  if (!model) return [];
  const best = {};
  for (const d of model.drivers) {
    for (const l of d.laps) {
      if (!eligibleForBest(l)) continue;
      // Segmentation needs a start timestamp and a duration to pin the window.
      if (!l.date_start || !l.lap_duration) continue;
      const cur = best[d.team];
      if (!cur || l.lap_duration < cur.lap.lap_duration) {
        best[d.team] = { team: d.team, driver: d.driver.name_acronym || String(d.driver.driver_number), driverNumber: d.driver.driver_number, lap: l };
      }
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
    .map(t => {
      const cornerGap = round3(t.cornerDelta);
      const curveGap = round3(t.curveDelta);
      const straightGap = round3(t.straightDelta);
      return {
        team: t.label,
        driver: byLabel[t.label]?.driver ?? "",
        lapTime: byLabel[t.label]?.lapTime ?? 0,
        cornerTime: round3(t.cornerTime),
        curveTime: round3(t.curveTime),
        straightTime: round3(t.straightTime),
        cornerGap,
        curveGap,
        straightGap,
        // Summed from the rounded parts rather than rounded separately, so the
        // decomposition the UI promises (parts add up to the gap) holds exactly
        // in the artifact — at most 1.5 ms from the unrounded total.
        gapToFastest: round3(cornerGap + curveGap + straightGap),
      };
    })
    .sort((a, b) => a.gapToFastest - b.gapToFastest);

  return {
    meetingKey: race.meta.meetingKey,
    slug: race.meta.slug,
    meetingName: race.meta.meetingName,
    dateStart: race.meta.dateStart,
    round: race.meta.round,
    referenceTeam: cmp.baselineLabel,
    cornerCount: cmp.cornerCount,
    curveCount: cmp.curveCount,
    straightCount: cmp.straightCount,
    cornerDistance: Math.round(cmp.cornerDistance),
    curveDistance: Math.round(cmp.curveDistance),
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
        console.log(`${row.teams.length} teams · ${row.cornerCount}c/${row.curveCount}fc/${row.straightCount}s · ref ${row.referenceTeam}`);
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
  const [raceDrivers, qualiDrivers, laps, stints, qualiLaps, qualiStints, pits, raceControl, results, intervals, position, weather] = await Promise.all([
    fetchEndpoint("drivers", sk),
    qualiSk ? fetchEndpoint("drivers", qualiSk) : Promise.resolve(null),
    fetchEndpoint("laps", sk),
    fetchEndpoint("stints", sk),
    qualiSk ? fetchEndpoint("laps", qualiSk) : Promise.resolve(null),
    qualiSk ? fetchEndpoint("stints", qualiSk) : Promise.resolve(null),
    // The engine uses these to exclude safety-car laps, traffic and retired
    // cars' trailing laps. Each is optional — a miss just gates those steps.
    fetchEndpoint("pit", sk),
    fetchEndpoint("race_control", sk),
    fetchEndpoint("session_result", sk),
    fetchEndpoint("intervals", sk),
    fetchEndpoint("position", sk),
    fetchEndpoint("weather", sk),
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
    qualiDrivers: qualiDrivers || [],
    qualiStints: qualiStints || [],
    pits: pits || [],
    raceControl: raceControl || [],
    results: results || [],
    intervals: intervals || [],
    position: position || [],
    weather: weather || [],
    raceSessionKey: sk,
    qualiSessionKey: qualiSk || undefined,
    sprint: false,
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
