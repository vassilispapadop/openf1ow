// GET /api/session/:sk/bundle — everything the engine's SessionModel ingests,
// in one response, assembled from R2 through resolveResource. Intervals
// (~4 MB raw) are reduced to the samples the engine actually reads: those
// within [lap start − 2 s, lap start + 8 s] of one of that driver's laps.
// The reduced object is persisted per session so the parse happens once.
//
// Required parts: session, drivers, laps. Everything else is optional and
// reported in meta.missing so analyses can gate on it.

import { resolveResource, type CacheEnv, type Resolved } from "./r2-cache";
import { getSessionWindow, classifyState, type SessionState } from "./session-state";
import { fetchUpstreamOnce } from "./r2-cache";

const OPTIONAL = ["stints", "pit", "position", "race_control", "session_result", "weather", "overtakes"] as const;
const INTERVAL_BEFORE_MS = 2_000;
const INTERVAL_AFTER_MS = 8_000;

interface Part { status: number; body: string; xcache: string }

function parseArr<T = unknown>(r: Resolved | Part | null): T[] {
  if (!r || r.status !== 200) return [];
  try { const v = JSON.parse(r.body); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Keep only interval samples near a lap start for that driver. */
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
    // binary search the last start ≤ t + 2 s, then check window
    let lo = 0, hi = s.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid] <= t + INTERVAL_BEFORE_MS) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    return idx >= 0 && t >= s[idx] - INTERVAL_BEFORE_MS && t <= s[idx] + INTERVAL_AFTER_MS;
  });
}

export async function handleBundleRequest(request: Request, env: CacheEnv, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/session\/(\d+)\/bundle\/?$/);
  if (!m) return null;
  const sk = Number(m[1]);

  const get = (path: string) => resolveResource(path, env, ctx).catch((): Resolved => ({
    status: 502, body: "", xcache: "ERROR", policy: { ttl: 0, edgeMaxAge: 0, state: "unknown", settledAt: null, sk }, fetchedAt: null, upstreamCalls: 0,
  }));

  const [sessionR, driversR, lapsR] = await Promise.all([
    get(`/sessions?session_key=${sk}`), get(`/drivers?session_key=${sk}`), get(`/laps?session_key=${sk}`),
  ]);
  // Required parts: surface the upstream's own status so the client's
  // paywall (401) and pending (429) handling keep working.
  for (const r of [sessionR, driversR, lapsR]) {
    if (r.status !== 200) {
      const body = r.status === 401 || r.status === 429 ? r.body : JSON.stringify({ error: "session data unavailable" });
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Cache": "ERROR" };
      if (r.status === 429) headers["Retry-After"] = "12";
      return new Response(body, { status: r.status, headers });
    }
  }
  const session = parseArr<{ meeting_key: number }>(sessionR)[0] ?? null;
  const laps = parseArr<{ date_start: string; driver_number: number }>(lapsR);

  const optional = await Promise.all(OPTIONAL.map(ep => get(`/${ep}?session_key=${sk}`)));
  const meetingR = session ? await get(`/meetings?meeting_key=${session.meeting_key}`) : null;

  // Starting grid: OpenF1 publishes it against the qualifying session key,
  // so when the race has none, look it up through the meeting's sessions.
  let gridR = await get(`/starting_grid?session_key=${sk}`);
  if (session && parseArr(gridR).length === 0) {
    const sessionsR = await get(`/sessions?meeting_key=${session.meeting_key}`);
    const quali = parseArr<{ session_key: number; session_name: string; session_type: string }>(sessionsR)
      .find(s => /qualifying/i.test(s.session_name) && !/sprint/i.test(s.session_name));
    if (quali) {
      const qg = await get(`/starting_grid?session_key=${quali.session_key}`);
      if (parseArr(qg).length) gridR = qg;
    }
  }

  // Intervals: reduced per-lap windows, persisted once per session.
  const window = await getSessionWindow(sk, env.F1_DATA, fetchUpstreamOnce);
  const state: SessionState = classifyState(window);
  const derivedKey = `derived/${sk}/intervals-window.json`;
  let intervalsBody = "[]";
  let intervalsStatus = "MISS";
  try {
    const d = await env.F1_DATA.get(derivedKey);
    if (d && state !== "live") { intervalsBody = await d.text(); intervalsStatus = "HIT"; }
    else {
      const raw = await get(`/intervals?session_key=${sk}`);
      if (raw.status === 200) {
        const reduced = windowIntervals(parseArr(raw), laps);
        intervalsBody = JSON.stringify(reduced);
        if (state === "settled" || state === "recent") {
          ctx.waitUntil(env.F1_DATA.put(derivedKey, intervalsBody, { httpMetadata: { contentType: "application/json" }, customMetadata: { fetchedAt: String(Date.now()) } }));
        }
      }
    }
  } catch { /* leave empty */ }

  const missing: string[] = [];
  const parts: Record<string, unknown> = {};
  OPTIONAL.forEach((ep, i) => {
    const arr = parseArr(optional[i]);
    parts[ep] = arr;
    if (optional[i].status !== 200 || (!arr.length && ep !== "overtakes")) missing.push(ep);
  });
  const grid = parseArr(gridR);
  if (!grid.length) missing.push("starting_grid");
  if (intervalsBody === "[]") missing.push("intervals");

  const payload = {
    meta: { sessionKey: sk, state, generatedAt: new Date().toISOString(), missing, partial: missing.some(m => m !== "starting_grid" && m !== "overtakes"), intervals: intervalsStatus },
    session,
    meeting: parseArr(meetingR)[0] ?? null,
    drivers: parseArr(driversR),
    laps,
    stints: parts.stints, pit: parts.pit, position: parts.position, race_control: parts.race_control,
    session_result: parts.session_result, weather: parts.weather, overtakes: parts.overtakes,
    starting_grid: grid,
    intervals: JSON.parse(intervalsBody),
  };
  const body = JSON.stringify(payload);
  // Hash the content, not the timestamp, so an unchanged bundle validates.
  const etag = `W/"${(await sha1Hex(JSON.stringify({ ...payload, meta: { ...payload.meta, generatedAt: "" } }))).slice(0, 16)}"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const edge = state === "settled" ? 604_800 : state === "recent" ? 300 : 30;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": `public, max-age=60, s-maxage=${payload.meta.partial ? 60 : edge}`,
      "X-Session-State": state,
    },
  });
}
