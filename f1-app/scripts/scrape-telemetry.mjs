#!/usr/bin/env node
/**
 * Scrapes telemetry data (car_data + location) for all drivers in completed
 * 2026 sessions and uploads to Cloudflare R2.
 *
 * Usage:
 *   node scripts/scrape-telemetry.mjs
 *   node scripts/scrape-telemetry.mjs --dry-run
 *
 * Rate limiting: 1.5s between requests, 3s between drivers, 10s between sessions.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.openf1.org/v1";
const BUCKET = "openf1-data";
const CACHE_DIR = join(import.meta.dirname, ".cache-telemetry");
const REQUEST_DELAY = 1500;   // 1.5s between API requests
const DRIVER_DELAY = 3000;    // 3s between drivers
const SESSION_DELAY = 10000;  // 10s between sessions

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
let uploadCount = 0;
let skipCount = 0;
let errorCount = 0;

async function fetchJson(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API + path);
      if (res.ok) {
        fetchCount++;
        return await res.json();
      }
      if (res.status === 404) return null;
      if (res.status === 429) {
        console.warn(`  [429 rate limited] — waiting 30s...`);
        await sleep(30000);
        continue;
      }
      console.warn(`  [${res.status}] ${path} — retrying in ${(attempt + 1) * 3}s...`);
    } catch (e) {
      console.warn(`  [error] ${path} — ${e.message}`);
    }
    await sleep((attempt + 1) * 3000);
  }
  console.error(`  FAILED: ${path}`);
  errorCount++;
  return null;
}

function r2Key(path) {
  const [base, qs] = path.split("?");
  const clean = base.replace(/^\//, "");
  if (!qs) return clean;
  const params = new URLSearchParams(qs);
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return clean + "?" + sorted.map(([k, v]) => `${k}=${v}`).join("&");
}

function cacheFile(key) {
  return join(CACHE_DIR, key.replace(/[/?&=<>:]/g, "_") + ".json");
}

function uploadToR2(key, data) {
  if (dryRun) {
    console.log(`    [dry-run] would upload: ${key} (${(JSON.stringify(data).length / 1024 / 1024).toFixed(1)}MB)`);
    return true;
  }
  const tmpPath = cacheFile(key);
  writeFileSync(tmpPath, JSON.stringify(data));
  try {
    execSync(
      `npx wrangler r2 object put "${BUCKET}/${key}" --file="${tmpPath}" --content-type="application/json" --remote`,
      { stdio: "pipe", cwd: join(import.meta.dirname, "..") },
    );
    uploadCount++;
    return true;
  } catch (e) {
    console.error(`    Upload failed for ${key}: ${e.message}`);
    errorCount++;
    return false;
  }
}

function isAlreadyDone(key) {
  return existsSync(cacheFile(key));
}

// Load session-level cache from the main scraper
const mainCache = join(import.meta.dirname, ".cache");

function readMainCache(filename) {
  const p = join(mainCache, filename);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

// ============================================================================

async function main() {
  console.log("OpenF1 Telemetry Scraper (car_data + location)");
  console.log(`Rate limits: ${REQUEST_DELAY}ms/req, ${DRIVER_DELAY}ms/driver, ${SESSION_DELAY}ms/session`);
  console.log(dryRun ? "[DRY RUN]\n" : "\n");

  // Get all completed sessions from the main scraper cache
  const meetings = readMainCache("meetings_year_2026.json");
  if (!meetings) {
    console.error("Run the main scraper first: npm run scrape -- --year 2026");
    process.exit(1);
  }

  const allSessions = [];
  for (const meeting of meetings) {
    // Skip pre-season testing — huge sessions, not useful for race analysis
    if (meeting.meeting_name?.toLowerCase().includes("test")) continue;
    const mk = meeting.meeting_key;
    const sessions = readMainCache(`sessions_meeting_key_${mk}.json`);
    if (!sessions) continue;
    for (const s of sessions) {
      if (s.date_end && new Date(s.date_end) < new Date()) {
        allSessions.push({ ...s, meetingName: meeting.meeting_name });
      }
    }
  }

  console.log(`Found ${allSessions.length} completed sessions\n`);

  let totalDrivers = 0;
  let totalEndpoints = 0;

  for (const session of allSessions) {
    const sk = session.session_key;
    console.log(`\n${session.meetingName} — ${session.session_name} (sk=${sk})`);

    // Load drivers for this session
    const drivers = readMainCache(`drivers_session_key_${sk}.json`);
    if (!drivers?.length) {
      console.log("  No drivers found, skipping");
      continue;
    }

    console.log(`  ${drivers.length} drivers`);

    for (const driver of drivers) {
      const dn = driver.driver_number;
      const acronym = driver.name_acronym || dn;

      const endpoints = [
        { name: "car_data", path: `/car_data?session_key=${sk}&driver_number=${dn}` },
        { name: "location", path: `/location?session_key=${sk}&driver_number=${dn}` },
      ];

      let driverSkipped = true;

      for (const ep of endpoints) {
        const key = r2Key(ep.path);

        if (isAlreadyDone(key)) {
          skipCount++;
          continue;
        }

        driverSkipped = false;
        totalEndpoints++;

        process.stdout.write(`  ${acronym} ${ep.name}...`);
        const data = await fetchJson(ep.path);

        if (data !== null) {
          const sizeMB = (JSON.stringify(data).length / 1024 / 1024).toFixed(1);
          const ok = uploadToR2(key, data);
          console.log(` ${sizeMB}MB ${ok ? "✓" : "✗"}`);
        } else {
          console.log(" (no data)");
        }

        await sleep(REQUEST_DELAY);
      }

      if (!driverSkipped) {
        totalDrivers++;
        await sleep(DRIVER_DELAY);
      }
    }

    await sleep(SESSION_DELAY);
  }

  console.log(`\n=== Done ===`);
  console.log(`Fetched: ${fetchCount} | Uploaded: ${uploadCount} | Skipped: ${skipCount} | Errors: ${errorCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
