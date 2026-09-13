#!/usr/bin/env node
/**
 * Derives the per-lap intervals window for every settled race session and
 * uploads it to R2 as derived/{sk}/intervals-window.json — the object the
 * session bundle serves instead of the ~3–4 MB raw intervals feed. Doing this
 * offline keeps the multi-MB parse out of the Worker's request path.
 *
 *   node scripts/derive-intervals.mjs --year 2026          # every race/sprint in the index
 *   node scripts/derive-intervals.mjs --session 11361
 *   node scripts/derive-intervals.mjs --year 2026 --force  # recompute existing objects
 *
 * Reads through the site's proxy (R2-backed), 1 request/s, and uploads with
 * wrangler. Skips sessions that already have an object unless --force.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const year = flag("--year");
const onlySk = flag("--session");
const force = args.includes("--force");
const BASE = "https://www.openf1ow.com/api/f1";
const BUCKET = "openf1-data";
const tmp = join(root, "scripts", ".cache-derived");
mkdirSync(tmp, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(BASE + path);
    if (res.ok) return res.json();
    if (res.status === 404) return [];
    await sleep(res.status === 429 || res.status === 401 ? 15_000 : 2_000);
  }
  throw new Error("gave up " + path);
}

/** Same rule as the Worker: samples within [lap start − 2 s, +8 s] for that driver. */
function windowIntervals(intervals, laps) {
  const starts = {};
  for (const l of laps) { const t = Date.parse(l.date_start); if (Number.isFinite(t)) (starts[l.driver_number] ||= []).push(t); }
  for (const a of Object.values(starts)) a.sort((x, y) => x - y);
  return intervals.filter(r => {
    const s = starts[r.driver_number]; if (!s) return false;
    const t = Date.parse(r.date); if (!Number.isFinite(t)) return false;
    let lo = 0, hi = s.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid] <= t + 2000) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    return idx >= 0 && t >= s[idx] - 2000 && t <= s[idx] + 8000;
  });
}

function exists(key) {
  try { execSync(`npx wrangler r2 object get "${BUCKET}/${key}" --remote --file /dev/null`, { stdio: "ignore", cwd: root }); return true; }
  catch { return false; }
}

async function derive(sk, label) {
  const key = `derived/${sk}/intervals-window.json`;
  if (!force && exists(key)) { console.log(`  ${label.padEnd(24)} ${sk}  exists`); return; }
  const [laps, intervals] = [await get(`/laps?session_key=${sk}`), await get(`/intervals?session_key=${sk}`)];
  await sleep(1000);
  if (!laps.length || !intervals.length) { console.log(`  ${label.padEnd(24)} ${sk}  no laps/intervals — skipped`); return; }
  const reduced = windowIntervals(intervals, laps);
  const file = join(tmp, `${sk}.json`);
  writeFileSync(file, JSON.stringify(reduced));
  execSync(`npx wrangler r2 object put "${BUCKET}/${key}" --file="${file}" --content-type="application/json" --remote`, { stdio: "ignore", cwd: root });
  console.log(`  ${label.padEnd(24)} ${sk}  ${intervals.length} → ${reduced.length} rows, uploaded`);
}

const idx = JSON.parse(readFileSync(join(root, "public", "race-index.json"), "utf8"));
const now = Date.now();
const targets = [];
if (onlySk) targets.push({ sk: Number(onlySk), label: "session" });
else {
  for (const y of year ? [String(year)] : Object.keys(idx.byYear)) {
    for (const r of idx.byYear[y] ?? []) {
      if (!r.dateStart || Date.parse(r.dateStart) > now - 86_400_000) continue;   // settled only (≥ 1 day old)
      for (const kind of ["race", "sprint"]) if (r.sessions?.[kind]) targets.push({ sk: r.sessions[kind], label: `${y} ${r.slug} ${kind}` });
    }
  }
}
console.log(`${targets.length} sessions`);
for (const t of targets) { try { await derive(t.sk, t.label); } catch (e) { console.log(`  ${t.label} ${t.sk} failed: ${e.message}`); } }
console.log("done");
