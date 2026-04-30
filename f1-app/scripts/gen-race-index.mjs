#!/usr/bin/env node
/**
 * Builds public/race-index.json: a slug-keyed catalog of all F1 races.
 *
 *   {
 *     "generatedAt": "2026-04-30T...",
 *     "byYear": {
 *       "2026": [
 *         {
 *           "slug": "imola",
 *           "meetingKey": 1234,
 *           "meetingName": "Emilia Romagna Grand Prix",
 *           "officialName": "FORMULA 1 ...",
 *           "country": "Italy",
 *           "countryCode": "ITA",
 *           "location": "Imola",
 *           "circuit": "Imola",
 *           "dateStart": "2026-04-19",
 *           "sessions": { "race": 5678, "qualifying": 5677, "fp1": ..., "fp2": ..., "fp3": ..., "sprint": ..., "sprintqualifying": ... }
 *         }
 *       ]
 *     }
 *   }
 *
 * Used by the build to generate sitemap.xml and at runtime to resolve
 * /:year/:slug → meetingKey for slug-based routing & OG injection.
 *
 * Usage:
 *   node scripts/gen-race-index.mjs              # all years (2023-2026)
 *   node scripts/gen-race-index.mjs --year 2026  # single year
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT = join(REPO_ROOT, "public", "race-index.json");
const API = "https://api.openf1.org/v1";

const args = process.argv.slice(2);
const yearIdx = args.indexOf("--year");
const targetYear = yearIdx >= 0 ? Number(args[yearIdx + 1]) : null;
const YEARS = targetYear ? [targetYear] : [2023, 2024, 2025, 2026];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path, { retries = 5, requireNonEmpty = false } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(API + path);
      if (r.ok) {
        const data = await r.json();
        // OpenF1 occasionally returns [] under load instead of a 5xx.
        // For endpoints we know must have data (sessions for a real meeting),
        // treat empty as transient and retry.
        if (requireNonEmpty && Array.isArray(data) && data.length === 0) {
          await sleep(800 * (i + 1));
          continue;
        }
        return data;
      }
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(800 * (i + 1));
  }
  return requireNonEmpty ? null : [];
}

// Slugify: lowercase, ASCII, hyphenated. Strips diacritics.
function slugify(s) {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Map an OpenF1 session_name to a stable slug component.
//   "Race" → "race"
//   "Qualifying" → "qualifying"
//   "Sprint" → "sprint"
//   "Sprint Qualifying" / "Sprint Shootout" → "sprintqualifying"
//   "Practice 1" → "fp1"
function sessionSlug(name) {
  if (!name) return null;
  const s = name.toLowerCase().trim();
  if (s === "race") return "race";
  if (s === "qualifying") return "qualifying";
  if (s === "sprint") return "sprint";
  if (s.startsWith("sprint qual") || s === "sprint shootout") return "sprintqualifying";
  const m = s.match(/^practice\s*(\d)/);
  if (m) return "fp" + m[1];
  return slugify(s);
}

// Pick the best slug for a meeting. Prefer location, fall back to country, then name.
function meetingSlug(meeting, takenSlugs) {
  const candidates = [
    meeting.location,
    meeting.country_name,
    meeting.meeting_name?.replace(/grand prix/i, "").trim(),
  ].filter(Boolean);

  for (const c of candidates) {
    const slug = slugify(c);
    if (slug && !takenSlugs.has(slug)) return slug;
  }
  // Disambiguate by appending the meeting key (rare collision case)
  const base = slugify(candidates[0] || "race");
  return base + "-" + meeting.meeting_key;
}

async function buildYear(year) {
  console.log(`\n=== ${year} ===`);
  const meetings = await fetchJson(`/meetings?year=${year}`);
  if (!meetings?.length) {
    console.log(`  no meetings`);
    return [];
  }
  console.log(`  ${meetings.length} meetings`);

  // Sort meetings by date so duplicate-location collisions resolve deterministically.
  meetings.sort((a, b) => (a.date_start || "").localeCompare(b.date_start || ""));

  const taken = new Set();
  const out = [];

  for (const m of meetings) {
    const slug = meetingSlug(m, taken);
    taken.add(slug);

    const sessions = await fetchJson(`/sessions?meeting_key=${m.meeting_key}`, { requireNonEmpty: true });
    await sleep(400);

    const sessionMap = {};
    for (const s of sessions || []) {
      const key = sessionSlug(s.session_name);
      if (key && !sessionMap[key]) sessionMap[key] = s.session_key;
    }

    // Skip pre-season testing — those meetings have only "day-1/2/3" and no race.
    if (m.meeting_name?.toLowerCase().includes("pre-season")) {
      console.log(`  [skip] ${slug.padEnd(18)} mk=${m.meeting_key} (testing)`);
      continue;
    }
    // Real meeting but no race session yet (future race or transient API miss).
    // Keep it in the index — consumers (sitemap, recap) check sessions.race.
    if (!sessionMap.race) {
      console.log(`  [warn] ${slug.padEnd(18)} mk=${m.meeting_key} (no race session — future or API miss)`);
    }

    out.push({
      slug,
      meetingKey: m.meeting_key,
      meetingName: m.meeting_name || "",
      officialName: m.meeting_official_name || "",
      country: m.country_name || "",
      countryCode: m.country_code || "",
      location: m.location || "",
      circuit: m.circuit_short_name || m.location || "",
      dateStart: (m.date_start || "").slice(0, 10),
      sessions: sessionMap,
    });

    console.log(`  ${slug.padEnd(20)} mk=${m.meeting_key} sessions=${Object.keys(sessionMap).join(",")}`);
  }

  return out;
}

async function main() {
  // Load existing index so partial runs (--year) preserve other years.
  let existing = { generatedAt: null, byYear: {} };
  if (existsSync(OUT)) {
    try { existing = JSON.parse(readFileSync(OUT, "utf-8")); } catch { /* fresh */ }
  }

  const byYear = { ...existing.byYear };

  for (const y of YEARS) {
    const races = await buildYear(y);
    if (races.length) byYear[y] = races;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    byYear,
  }, null, 2));

  const total = Object.values(byYear).reduce((n, arr) => n + arr.length, 0);
  console.log(`\nWrote ${OUT} (${total} races across ${Object.keys(byYear).length} seasons)`);
}

main().catch(e => { console.error(e); process.exit(1); });
