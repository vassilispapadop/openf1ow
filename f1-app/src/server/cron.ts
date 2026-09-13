// Scheduled work: once a session has settled, pull its data into R2, derive
// the intervals window, run the engine and store the insights — so the first
// visitor after a race gets a warm bundle and one small insights GET, and
// nothing multi-megabyte is ever parsed in a request. One session per tick;
// a second pass 48 h later picks up late corrections to the timing data.
//
// Also reachable as POST /api/admin/cron for an operator (see admin.ts).

import { resolveResource, type CacheEnv } from "./r2-cache";
import { purgeSession, warmSession, STANDARD_ENDPOINTS } from "./admin";
import { windowIntervals } from "./bundle";
import { computeInsights } from "./insights";

export { pickSession, FIRST_PASS_DELAY_MS, SECOND_PASS_DELAY_MS, HORIZON_MS, type SessionRow, type DoneMarker } from "./cron-pick";
import { pickSession, FIRST_PASS_DELAY_MS, HORIZON_MS, type SessionRow, type DoneMarker } from "./cron-pick";

export interface TickReport {
  ranAt: string;
  picked: { session_key: number; session_name: string; pass: 1 | 2 } | null;
  warmed?: Record<string, string>;
  intervals?: string;
  insights?: string;
  championship?: Record<string, string>;
  skipped?: string;
}

async function readDone(bucket: R2Bucket, sk: number): Promise<DoneMarker> {
  try {
    const o = await bucket.get(`meta/done/${sk}.json`);
    return o ? (JSON.parse(await o.text()) as DoneMarker) : {};
  } catch { return {}; }
}

/** Derive derived/{sk}/intervals-window.json from the raw intervals feed —
 *  the same reduction scripts/derive-intervals.mjs does offline. Off the
 *  request path, so the multi-MB parse is fine here. */
async function deriveIntervals(sk: number, env: CacheEnv, ctx: ExecutionContext): Promise<string> {
  const key = `derived/${sk}/intervals-window.json`;
  const [lapsR, intR] = [await resolveResource(`/laps?session_key=${sk}`, env, ctx), await resolveResource(`/intervals?session_key=${sk}`, env, ctx)];
  if (lapsR.status !== 200 || intR.status !== 200) return `skipped (laps ${lapsR.status}, intervals ${intR.status})`;
  let laps: { date_start: string; driver_number: number }[], intervals: { date: string; driver_number: number }[];
  try { laps = JSON.parse(lapsR.body); intervals = JSON.parse(intR.body); } catch { return "skipped (unparseable)"; }
  if (!Array.isArray(laps) || !Array.isArray(intervals) || !laps.length || !intervals.length) return "skipped (empty)";
  const reduced = windowIntervals(intervals, laps);
  await env.F1_DATA.put(key, JSON.stringify(reduced), { httpMetadata: { contentType: "application/json" }, customMetadata: { fetchedAt: String(Date.now()) } });
  return `${intervals.length} → ${reduced.length} rows`;
}

export async function runScheduledTick(env: CacheEnv, ctx: ExecutionContext, opts: { now?: number; force?: number } = {}): Promise<TickReport> {
  const now = opts.now ?? Date.now();
  const report: TickReport = { ranAt: new Date(now).toISOString(), picked: null };

  const year = new Date(now).getUTCFullYear();
  const listR = await resolveResource(`/sessions?year=${year}`, env, ctx);
  if (listR.status !== 200) { report.skipped = `sessions list ${listR.status}`; return report; }
  let rows: SessionRow[];
  try { rows = JSON.parse(listR.body); } catch { report.skipped = "sessions list unparseable"; return report; }

  let pick: { row: SessionRow; pass: 1 | 2 } | null = null;
  if (opts.force) {
    const row = rows.find(r => r.session_key === opts.force);
    if (!row) { report.skipped = `session ${opts.force} not in ${year}`; return report; }
    const m = await readDone(env.F1_DATA, row.session_key);
    pick = { row, pass: m.pass1At ? 2 : 1 };
  } else {
    // Only sessions inside the window need their marker read.
    const candidates = rows.filter(r => { const e = Date.parse(r.date_end); return Number.isFinite(e) && now > e + FIRST_PASS_DELAY_MS && now < e + HORIZON_MS; });
    const done = new Map<number, DoneMarker>();
    for (const r of candidates) done.set(r.session_key, await readDone(env.F1_DATA, r.session_key));
    pick = pickSession(candidates, done, now);
  }
  if (!pick) { report.skipped = "nothing due"; return report; }

  const { row, pass } = pick;
  const sk = row.session_key;
  report.picked = { session_key: sk, session_name: row.session_name, pass };

  // Second pass: drop what the first pass cached so corrections come through.
  if (pass === 2) {
    await purgeSession(sk, env);
    const m = await readDone(env.F1_DATA, sk);
    delete m.intervalsAttemptedAt;
    await env.F1_DATA.put(`meta/done/${sk}.json`, JSON.stringify(m), { httpMetadata: { contentType: "application/json" } });
  }

  report.warmed = await warmSession(sk, env, ctx, STANDARD_ENDPOINTS);
  // Paywall still up (401) or throttled (429): leave the marker unwritten so
  // the next tick retries.
  const blocked = Object.values(report.warmed).some(v => v.startsWith("401") || v.startsWith("429"));
  if (blocked) { report.skipped = "upstream blocked — will retry"; return report; }

  const isRace = row.session_type === "Race";
  const marker = await readDone(env.F1_DATA, sk);
  const putMarker = () => env.F1_DATA.put(`meta/done/${sk}.json`, JSON.stringify(marker), { httpMetadata: { contentType: "application/json" } });
  if (isRace) {
    // Best effort: the parse can exceed the free plan's CPU allowance, and a
    // killed tick cannot be caught — so record the attempt first and never
    // try twice. scripts/derive-intervals.mjs covers what the Worker cannot.
    if (marker.intervalsAttemptedAt) report.intervals = "skipped (attempted before)";
    else {
      marker.intervalsAttemptedAt = new Date(now).toISOString();
      await putMarker();
      report.intervals = await deriveIntervals(sk, env, ctx);
    }
  }

  const ins = await computeInsights(sk, env, ctx);
  report.insights = `${ins.status} ${ins.cached ? "HIT" : "computed"} (${ins.state})`;

  if (isRace) {
    report.championship = {};
    for (const ep of ["championship_drivers", "championship_teams"]) {
      try {
        const r = await resolveResource(`/${ep}?meeting_key=${row.meeting_key}`, env, ctx);
        report.championship[ep] = `${r.status} ${r.xcache}`;
      } catch (e) { report.championship[ep] = "error " + (e instanceof Error ? e.message : String(e)); }
    }
  }

  if (pass === 1) marker.pass1At = new Date(now).toISOString(); else marker.pass2At = new Date(now).toISOString();
  await putMarker();
  return report;
}
