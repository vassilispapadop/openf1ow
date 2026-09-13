#!/usr/bin/env node
/**
 * Records one session as an engine test fixture.
 *
 *   node scripts/record-fixture.mjs --session 11253 --slug suzuka-2026-race
 *   node scripts/record-fixture.mjs --session 11275 --slug miami-2026-sprint --base https://api.openf1.org/v1
 *
 * Writes src/engine/__fixtures__/<slug>/<endpoint>.json for every endpoint
 * buildSessionModel() can ingest, plus index.json with the session window and
 * row counts. Reads through the site's own proxy by default so settled
 * sessions come from R2 without spending OpenF1 rate budget.
 *
 * `intervals` is ~4 MB for a race, so only the samples the engine reads are
 * kept: those within [lap start − 2 s, lap start + 8 s] of one of that
 * driver's laps. `position` is kept whole (a few hundred rows).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const sk = flag("--session");
const slug = flag("--slug");
const base = (flag("--base", "https://www.openf1ow.com/api/f1")).replace(/\/$/, "");
if (!sk || !slug) {
  console.error("usage: record-fixture.mjs --session <session_key> --slug <name> [--base <url>]");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "engine", "__fixtures__", slug);
mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(base + path);
    if (res.ok) return res.json();
    if (res.status === 404) return [];
    // 429 from OpenF1 (directly or passed through the proxy) — back off.
    const wait = res.status === 429 ? 12_000 : 2_000 * (attempt + 1);
    process.stdout.write(`  ${path} → ${res.status}, retrying in ${wait / 1000}s\n`);
    await sleep(wait);
  }
  throw new Error(`gave up on ${path}`);
}

const ENDPOINTS = [
  "drivers", "laps", "stints", "pit", "position", "intervals",
  "race_control", "session_result", "weather", "starting_grid", "overtakes",
];

const counts = {};
const write = (name, data) => {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data));
  counts[name] = Array.isArray(data) ? data.length : 1;
  process.stdout.write(`  ${name.padEnd(15)} ${String(counts[name]).padStart(6)} rows\n`);
};

console.log(`Recording session ${sk} → ${outDir}`);
const [session] = await get(`/sessions?session_key=${sk}`);
if (!session) { console.error("session not found"); process.exit(1); }
write("session", session);
await sleep(600);
const [meeting] = await get(`/meetings?meeting_key=${session.meeting_key}`);
write("meeting", meeting ?? null);

let laps = [];
for (const ep of ENDPOINTS) {
  await sleep(600);
  let data = await get(`/${ep}?session_key=${sk}`);
  if (ep === "laps") laps = data;
  if (ep === "intervals" && Array.isArray(data) && laps.length) {
    const starts = {};
    for (const l of laps) {
      const t = Date.parse(l.date_start);
      if (Number.isFinite(t)) (starts[l.driver_number] ||= []).push(t);
    }
    const before = data.length;
    data = data.filter(r => {
      const t = Date.parse(r.date);
      const s = starts[r.driver_number];
      return s && s.some(ls => t >= ls - 2000 && t <= ls + 8000);
    });
    process.stdout.write(`  intervals downsampled ${before} → ${data.length}\n`);
  }
  write(ep, data);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify({
  sessionKey: Number(sk),
  slug,
  recordedAt: new Date().toISOString(),
  source: base,
  sessionName: session.session_name,
  sessionType: session.session_type,
  dateStart: session.date_start,
  dateEnd: session.date_end,
  counts,
}, null, 2));
console.log("done");
