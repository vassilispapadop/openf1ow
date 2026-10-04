#!/usr/bin/env node
/**
 * Compute the insights artifact (insights/{sk}.v1.json) locally and upload
 * it to R2 — the same engine the Worker runs, on the same bundle, but in Node
 * where CPU is not the Free plan's request allowance. Use it after an engine
 * change to bring every stored artifact up to date, or when a session's
 * artifact is missing because the Worker's run was killed (error 1102).
 *
 * Usage:
 *   node scripts/compute-insights.mjs --year 2026            # every race + sprint
 *   node scripts/compute-insights.mjs --session 11731
 *   node scripts/compute-insights.mjs --year 2026 --dry-run  # compute, don't upload
 *   node scripts/compute-insights.mjs --year 2026 --all-sessions   # practice + quali too
 *
 * The payload matches src/server/insights.ts exactly (facts + meta); the
 * session state rides in the object's meta and the Worker reads it from
 * there, so a "recent" artifact is still served with a recent TTL.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { inputsFromBundle } from "../src/engine/bundle.ts";
import { buildSessionModel } from "../src/engine/session/build.ts";
import { buildFacts } from "../src/engine/summary/facts.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "scripts", ".cache-insights");
const ORIGIN = process.env.OPENF1OW_ORIGIN || "https://www.openf1ow.com";
const BUCKET = "openf1-data";
const VERSION = 1;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const dryRun = args.includes("--dry-run");
const allSessions = args.includes("--all-sessions");
const year = flag("--year");
const session = flag("--session");
if (!year && !session) {
  console.error("usage: compute-insights.mjs --year <YYYY> | --session <SK> [--dry-run] [--all-sessions]");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

function targets() {
  if (session) return [{ label: `session ${session}`, sk: Number(session) }];
  const idx = JSON.parse(readFileSync(join(ROOT, "public", "race-index.json"), "utf-8"));
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const r of idx.byYear[year] ?? []) {
    if (r.dateStart > today) continue;
    const kinds = allSessions ? Object.keys(r.sessions) : ["race", "sprint"];
    for (const k of kinds) if (r.sessions[k]) out.push({ label: `${r.slug} ${k}`, sk: r.sessions[k] });
  }
  return out;
}

async function fetchBundle(sk) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${ORIGIN}/api/session/${sk}/bundle`);
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
    throw new Error(`bundle ${res.status}`);
  }
  throw new Error("bundle: gave up");
}

function upload(sk, body) {
  const tmp = join(OUT_DIR, `${sk}.v${VERSION}.json`);
  writeFileSync(tmp, body);
  if (dryRun) return `dry-run (${body.length} bytes at ${tmp})`;
  execSync(
    `npx wrangler r2 object put "${BUCKET}/insights/${sk}.v${VERSION}.json" --file="${tmp}" --content-type="application/json" --remote`,
    { cwd: ROOT, stdio: "pipe" },
  );
  return `uploaded (${body.length} bytes)`;
}

const list = targets();
console.log(`${list.length} session(s)`);
let failed = 0;
for (const t of list) {
  process.stdout.write(`  ${t.label.padEnd(28)} ${String(t.sk).padEnd(6)} `);
  try {
    const bundle = await fetchBundle(t.sk);
    const state = bundle.meta?.state ?? "unknown";
    if (state === "live" || state === "upcoming" || bundle.meta?.partial) {
      console.log(`skipped (${state}${bundle.meta?.partial ? ", partial" : ""})`);
      continue;
    }
    const model = buildSessionModel(inputsFromBundle(bundle));
    const facts = buildFacts(model);
    const payload = {
      ...facts,
      meta: { sessionKey: t.sk, state, generatedAt: new Date().toISOString(), version: VERSION, missing: bundle.meta?.missing ?? [] },
    };
    console.log(`${state} · ${model.laps.length} laps · ${upload(t.sk, JSON.stringify(payload))}`);
  } catch (e) {
    failed++;
    console.log(`FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
  await new Promise(r => setTimeout(r, 500));
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("done");
