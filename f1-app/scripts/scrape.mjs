#!/usr/bin/env node
/**
 * Scrapes historical F1 session-level data from OpenF1 API and uploads to Cloudflare R2.
 *
 * Usage:
 *   node scripts/scrape.mjs                   # scrape all years (2023-2026)
 *   node scripts/scrape.mjs --year 2024       # scrape a specific year
 *   node scripts/scrape.mjs --dry-run         # fetch but don't upload
 *
 * Prerequisites:
 *   - wrangler must be authenticated (`wrangler login`)
 *   - R2 bucket "openf1-data" must exist (`wrangler r2 bucket create openf1-data`)
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.openf1.org/v1";
const BUCKET = "openf1-data";
const CACHE_DIR = join(import.meta.dirname, ".cache");
const DELAY_MS = 200; // delay between API requests
const SESSION_DELAY_MS = 1000; // delay between sessions

// Session-level endpoints to scrape (no telemetry — too large)
const SESSION_ENDPOINTS = [
  "drivers",
  "laps",
  "stints",
  "pit",
  "position",
  "weather",
  "race_control",
  "session_result",
  "intervals",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const yearIdx = args.indexOf("--year");
const targetYear = yearIdx >= 0 ? Number(args[yearIdx + 1]) : null;
const years = targetYear ? [targetYear] : [2023, 2024, 2025, 2026];

mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
let uploadCount = 0;
let skipCount = 0;

async function fetchJson(path) {
  const url = API + path;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        fetchCount++;
        return await res.json();
      }
      if (res.status === 404) return null;
      console.warn(`  [${res.status}] ${path} — retrying...`);
    } catch (e) {
      console.warn(`  [error] ${path} — ${e.message} — retrying...`);
    }
    await sleep(1000 * (attempt + 1));
  }
  console.error(`  FAILED: ${path}`);
  return null;
}

function r2Key(path) {
  // Normalize: strip leading slash, sort query params
  const [base, qs] = path.split("?");
  const clean = base.replace(/^\//, "");
  if (!qs) return clean;
  const params = new URLSearchParams(qs);
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return clean + "?" + sorted.map(([k, v]) => `${k}=${v}`).join("&");
}

function localCachePath(key) {
  // Replace slashes and special chars for filesystem safety
  return join(CACHE_DIR, key.replace(/[/?&=<>:]/g, "_") + ".json");
}

function uploadToR2(key, data) {
  if (dryRun) {
    console.log(`  [dry-run] would upload: ${key}`);
    return;
  }
  const tmpPath = localCachePath(key);
  writeFileSync(tmpPath, JSON.stringify(data));
  try {
    execSync(
      `npx wrangler r2 object put "${BUCKET}/${key}" --file="${tmpPath}" --content-type="application/json" --remote`,
      { stdio: "pipe", cwd: join(import.meta.dirname, "..") },
    );
    uploadCount++;
  } catch (e) {
    console.error(`  Upload failed for ${key}: ${e.message}`);
  }
}

function isR2Cached(key) {
  // Check local cache dir as a proxy for "already uploaded"
  return existsSync(localCachePath(key));
}

async function scrapeYear(year) {
  console.log(`\n=== Scraping ${year} ===`);

  // 1. Meetings
  const meetingsKey = r2Key(`/meetings?year=${year}`);
  let meetings;
  if (isR2Cached(meetingsKey)) {
    console.log(`  [cached] meetings?year=${year}`);
    meetings = JSON.parse(readFileSync(localCachePath(meetingsKey), "utf-8"));
    skipCount++;
  } else {
    meetings = await fetchJson(`/meetings?year=${year}`);
    if (!meetings?.length) {
      console.log(`  No meetings found for ${year}`);
      return;
    }
    uploadToR2(meetingsKey, meetings);
    await sleep(DELAY_MS);
  }

  console.log(`  Found ${meetings.length} meetings`);

  // 2. For each meeting: sessions
  for (const meeting of meetings) {
    const mk = meeting.meeting_key;
    console.log(`\n  ${meeting.meeting_name || mk} (${meeting.date_start?.slice(0, 10) || "?"})`);

    const sessionsKey = r2Key(`/sessions?meeting_key=${mk}`);
    let sessions;
    if (isR2Cached(sessionsKey)) {
      console.log(`    [cached] sessions`);
      sessions = JSON.parse(readFileSync(localCachePath(sessionsKey), "utf-8"));
      skipCount++;
    } else {
      sessions = await fetchJson(`/sessions?meeting_key=${mk}`);
      if (!sessions?.length) {
        console.log(`    No sessions found`);
        continue;
      }
      uploadToR2(sessionsKey, sessions);
      await sleep(DELAY_MS);
    }

    // 3. For each completed session: scrape all endpoints
    for (const session of sessions) {
      const sk = session.session_key;
      const dateEnd = session.date_end;

      // Skip sessions that haven't finished yet
      if (!dateEnd || new Date(dateEnd) > new Date()) {
        console.log(`    [skip] ${session.session_name} — not yet completed`);
        continue;
      }

      console.log(`    ${session.session_name} (sk=${sk})`);

      for (const endpoint of SESSION_ENDPOINTS) {
        const key = r2Key(`/${endpoint}?session_key=${sk}`);
        if (isR2Cached(key)) {
          skipCount++;
          continue;
        }

        const data = await fetchJson(`/${endpoint}?session_key=${sk}`);
        if (data !== null) {
          uploadToR2(key, data);
        }
        await sleep(DELAY_MS);
      }

      await sleep(SESSION_DELAY_MS);
    }
  }
}

// Main
console.log(`OpenF1 Historical Data Scraper`);
console.log(`Years: ${years.join(", ")}${dryRun ? " [DRY RUN]" : ""}`);
console.log(`Cache dir: ${CACHE_DIR}`);

for (const year of years) {
  await scrapeYear(year);
}

console.log(`\n=== Done ===`);
console.log(`Fetched: ${fetchCount} | Uploaded: ${uploadCount} | Skipped (cached): ${skipCount}`);
