// GET /api/session/:sk/bundle — everything the engine's SessionModel ingests,
// in one response, assembled from R2 through resolveResource.
//
// The request path does no heavy work: the parts' JSON is spliced together
// as strings (never parsed and re-serialised), and intervals come only from
// the per-session derived object `derived/{sk}/intervals-window.json`, which
// scripts/derive-intervals.mjs produces offline (the raw feed is 3–4 MB and
// windowing it inside a request blew the Worker's limits on bigger races).
// Without that object the bundle ships with intervals empty and says so in
// meta.missing; traffic analyses gate off rather than guess.
//
// Required parts: session, drivers, laps. Everything else is optional.
// assembleBundle() is shared with the insights route, which parses the body
// once to run the engine.

import { resolveResource, type CacheEnv, type Resolved } from "./r2-cache";
import { getSessionWindow, classifyState, type SessionState } from "./session-state";
import { fetchUpstreamOnce } from "./r2-cache";

const OPTIONAL = ["stints", "pit", "position", "race_control", "session_result", "weather", "overtakes"] as const;

const isArrayBody = (r: Resolved | null): boolean => !!r && r.status === 200 && r.body.trimStart().startsWith("[");
const arrBody = (r: Resolved | null): string => (isArrayBody(r) ? r!.body : "[]");
const isEmptyArray = (s: string): boolean => s.replace(/\s/g, "") === "[]";

export async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Keep only interval samples near a lap start for that driver. Used by the
 *  offline script and tests; not called in the request path. */
export function windowIntervals(intervals: { date: string; driver_number: number }[], laps: { date_start: string; driver_number: number }[]) {
  const starts: Record<number, number[]> = {};
  for (const l of laps) {
    const t = Date.parse(l.date_start);
    if (Number.isFinite(t)) (starts[l.driver_number] ||= []).push(t);
  }
  for (const arr of Object.values(starts)) arr.sort((a, b) => a - b);
  return intervals.filter(r => {
    const s = starts[r.driver_number];
    if (!s) return false;
    const t = Date.parse(r.date);
    if (!Number.isFinite(t)) return false;
    let lo = 0, hi = s.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid] <= t + 2_000) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    return idx >= 0 && t >= s[idx] - 2_000 && t <= s[idx] + 8_000;
  });
}

export interface BundleMeta { sessionKey: number; state: SessionState; generatedAt: string; missing: string[]; partial: boolean; intervals: "derived" | "none" }

export type Assembled =
  | { ok: true; body: string; contentHash: string; meta: BundleMeta; state: SessionState }
  | { ok: false; status: number; body: string };

export async function assembleBundle(sk: number, env: CacheEnv, ctx: ExecutionContext): Promise<Assembled> {
  const get = (path: string) => resolveResource(path, env, ctx).catch((): Resolved => ({
    status: 502, body: "", xcache: "ERROR", policy: { ttl: 0, edgeMaxAge: 0, state: "unknown", settledAt: null, sk }, fetchedAt: null, upstreamCalls: 0,
  }));

  const [sessionR, driversR, lapsR] = await Promise.all([
    get(`/sessions?session_key=${sk}`), get(`/drivers?session_key=${sk}`), get(`/laps?session_key=${sk}`),
  ]);
  for (const r of [sessionR, driversR, lapsR]) {
    if (r.status !== 200) {
      const body = r.status === 401 || r.status === 429 ? r.body : JSON.stringify({ error: "session data unavailable" });
      return { ok: false, status: r.status, body };
    }
  }
  let session: { meeting_key: number } | null = null;
  try { session = (JSON.parse(sessionR.body) as { meeting_key: number }[])[0] ?? null; } catch { session = null; }
  if (!session) return { ok: false, status: 404, body: JSON.stringify({ error: "unknown session" }) };

  const [optional, meetingR, gridOwnR, sessionsR] = await Promise.all([
    Promise.all(OPTIONAL.map(ep => get(`/${ep}?session_key=${sk}`))),
    get(`/meetings?meeting_key=${session.meeting_key}`),
    get(`/starting_grid?session_key=${sk}`),
    get(`/sessions?meeting_key=${session.meeting_key}`),
  ]);

  // Starting grid is published against the qualifying session key.
  let gridBody = arrBody(gridOwnR);
  if (isEmptyArray(gridBody)) {
    try {
      const quali = (JSON.parse(arrBody(sessionsR)) as { session_key: number; session_name: string }[])
        .find(s => /qualifying/i.test(s.session_name) && !/sprint/i.test(s.session_name));
      if (quali) {
        const qg = await get(`/starting_grid?session_key=${quali.session_key}`);
        if (!isEmptyArray(arrBody(qg))) gridBody = arrBody(qg);
      }
    } catch { /* keep [] */ }
  }

  const window = await getSessionWindow(sk, env.F1_DATA, fetchUpstreamOnce);
  const state: SessionState = classifyState(window);

  let intervalsBody = "[]";
  let intervalsSource: BundleMeta["intervals"] = "none";
  try {
    const d = await env.F1_DATA.get(`derived/${sk}/intervals-window.json`);
    if (d) { intervalsBody = await d.text(); intervalsSource = "derived"; }
  } catch { /* none */ }

  const missing: string[] = [];
  const parts: string[] = [];
  OPTIONAL.forEach((ep, i) => {
    const b = arrBody(optional[i]);
    parts.push(`"${ep}":${b}`);
    if (optional[i].status !== 200 || (isEmptyArray(b) && ep !== "overtakes")) missing.push(ep);
  });
  if (isEmptyArray(gridBody)) missing.push("starting_grid");
  if (isEmptyArray(intervalsBody)) missing.push("intervals");

  let meetingBody = "null";
  try { const m = JSON.parse(arrBody(meetingR)); if (Array.isArray(m) && m[0]) meetingBody = JSON.stringify(m[0]); } catch { /* null */ }

  const meta: BundleMeta = {
    sessionKey: sk, state, generatedAt: new Date().toISOString(), missing,
    partial: missing.some(m => m !== "starting_grid" && m !== "overtakes" && m !== "intervals"),
    intervals: intervalsSource,
  };
  const rest =
    `"session":${JSON.stringify(session)},"meeting":${meetingBody},"drivers":${arrBody(driversR)},"laps":${arrBody(lapsR)},` +
    parts.join(",") + `,"starting_grid":${gridBody},"intervals":${intervalsBody}}`;
  const body = `{"meta":${JSON.stringify(meta)},` + rest;
  return { ok: true, body, contentHash: (await sha1Hex(rest)).slice(0, 16), meta, state };
}

export function edgeForState(state: SessionState, partial: boolean): number {
  if (partial) return 60;
  return state === "settled" ? 604_800 : state === "recent" ? 300 : 30;
}

export async function handleBundleRequest(request: Request, env: CacheEnv, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/session\/(\d+)\/bundle\/?$/);
  if (!m) return null;
  const sk = Number(m[1]);
  const a = await assembleBundle(sk, env, ctx);
  if (!a.ok) {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Cache": "ERROR" };
    if (a.status === 429) headers["Retry-After"] = "12";
    return new Response(a.body, { status: a.status, headers });
  }
  const etag = `W/"${a.contentHash}"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(a.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": `public, max-age=60, s-maxage=${edgeForState(a.state, a.meta.partial)}`,
      "X-Session-State": a.state,
      "X-Intervals": a.meta.intervals,
    },
  });
}
