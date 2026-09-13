// Read-through cache for the OpenF1 API.
//
//   1. Cloudflare edge cache (caches.default) — fastest; skips R2, parse, upstream
//   2. R2 — persistent, shared across edge nodes
//   3. OpenF1 origin (single-flight + retry), with stale-R2 fallback on failure
//
// How long something may be cached depends on where its session is in its
// life (session-state.ts): live data is served from R2 without touching the
// paywalled upstream, recent data refreshes every 15 minutes, settled data is
// immutable. A "forever" object is only trusted if it was fetched after the
// session settled — that floor lazily un-poisons the partial live snapshots
// the old "session_key= ⇒ forever" rule had frozen, with no migration.

import { getSessionWindow, classifyState, settledAt, type SessionState } from "./session-state";

const OPENF1 = "https://api.openf1.org/v1";
const CURRENT_YEAR = new Date().getFullYear();

export const TTL_FOREVER = Infinity;
const TTL_1H = 3_600_000;
const TTL_15M = 900_000;
const TTL_5M = 300_000;
const TTL_1M = 60_000;

export interface CacheEnv {
  F1_DATA: R2Bucket;
  ANALYTICS?: { writeDataPoint: (event: AnalyticsEngineDataPoint) => void };
}

interface AnalyticsEngineDataPoint {
  blobs?: (string | null)[];
  doubles?: number[];
  indexes?: string[];
}

/** Telemetry endpoints that are stored as full-session blobs in R2. */
const TELEMETRY_ENDPOINTS = ["car_data", "location"];

/** Everything the proxy will forward. Anything else is a 404 before any
 *  upstream call, so scanners and typos can't spend the OpenF1 budget. */
export const ENDPOINT_ALLOWLIST = new Set([
  "meetings", "sessions", "drivers", "laps", "stints", "pit", "position", "weather",
  "race_control", "session_result", "intervals", "car_data", "location",
  "overtakes", "starting_grid", "team_radio", "championship_drivers", "championship_teams",
]);

/**
 * Normalize an OpenF1 API path into a stable R2 key: strip the leading slash,
 * sort query params. For telemetry, strip date filters so the key matches
 * the full-session blob the scraper writes.
 */
export function normalizeKey(path: string): string {
  const [base, qs] = path.split("?");
  const clean = base.replace(/^\//, "");
  if (!qs) return clean;
  const params = new URLSearchParams(qs);
  const isTelemetry = TELEMETRY_ENDPOINTS.includes(clean);
  const sorted = [...params.entries()]
    .filter(([k]) => !isTelemetry || (!k.startsWith("date>") && !k.startsWith("date<")))
    .sort((a, b) => a[0].localeCompare(b[0]));
  return clean + "?" + sorted.map(([k, v]) => `${k}=${v}`).join("&");
}

/** Edge cache key: the real canonical URL with ALL params (including the
 *  date filters normalizeKey strips), so each client-visible telemetry slice
 *  is its own edge entry and Purge-by-URL can reach it. */
function edgeCacheKey(origin: string, apiPath: string): Request {
  const [base, qs] = apiPath.split("?");
  const clean = base.replace(/^\//, "");
  let canon = clean;
  if (qs) {
    const params = [...new URLSearchParams(qs).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    canon += "?" + params.map(([k, v]) => `${k}=${v}`).join("&");
  }
  return new Request(`${origin}/api/f1/${canon}`);
}

function getDateFilters(url: URL): { gte?: string; lte?: string } | null {
  const params = url.searchParams;
  const gte = params.get("date>=") || params.get("date>") || undefined;
  const lte = params.get("date<=") || params.get("date<") || undefined;
  if (!gte && !lte) return null;
  return { gte, lte };
}

function sliceByDate(data: any[], filters: { gte?: string; lte?: string }): any[] {
  return data.filter((item: any) => {
    if (!item.date) return true;
    if (filters.gte && item.date < filters.gte) return false;
    if (filters.lte && item.date > filters.lte) return false;
    return true;
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** In-isolate single-flight with one retry on 429/5xx. Every fetch carries a
 *  timeout, and so does waiting on a shared in-flight call: a fetch started
 *  by an invocation that was torn down (a cron tick, a cancelled request)
 *  never settles, and without the second timeout every later request for
 *  the same key in that isolate would hang on it. */
const UPSTREAM_TIMEOUT_MS = 12_000;
const INFLIGHT_WAIT_MS = 20_000;
const inflight = new Map<string, Promise<{ ok: boolean; status: number; body: string }>>();

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what + " timed out")), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export async function fetchUpstreamOnce(fetchPath: string): Promise<{ ok: boolean; status: number; body: string }> {
  const existing = inflight.get(fetchPath);
  if (existing) {
    try { return await withTimeout(existing, INFLIGHT_WAIT_MS, "shared upstream call"); }
    catch (e) { inflight.delete(fetchPath); throw e; }
  }
  const p = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(OPENF1 + fetchPath, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          await sleep(400 + Math.random() * 300);
          continue;
        }
        return { ok: res.ok, status: res.status, body: await res.text() };
      } catch (e) {
        lastErr = e;
        if (attempt === 0) { await sleep(400); continue; }
      }
    }
    throw lastErr ?? new Error("upstream fetch failed");
  })();
  inflight.set(fetchPath, p);
  try { return await p; } finally { inflight.delete(fetchPath); }
}

// ---------------------------------------------------------------------------
// TTL policy
// ---------------------------------------------------------------------------

export interface KeyPolicy {
  ttl: number;           // ms; TTL_FOREVER for immutable
  edgeMaxAge: number;    // seconds
  state: SessionState | "static";
  settledAt: number | null;   // forever objects must have been fetched after this
  sk: number | null;
}

const PURGE_MEMO_MS = 60_000;
const purgeMemo = new Map<number, { epoch: number; at: number }>();

async function purgeEpoch(bucket: R2Bucket, sk: number): Promise<number> {
  const m = purgeMemo.get(sk);
  if (m && Date.now() - m.at < PURGE_MEMO_MS) return m.epoch;
  let epoch = 0;
  try {
    const obj = await bucket.get(`meta/purge/${sk}.json`);
    if (obj) epoch = Number((JSON.parse(await obj.text()) as { epoch?: number }).epoch) || 0;
  } catch { /* none */ }
  purgeMemo.set(sk, { epoch, at: Date.now() });
  return epoch;
}

export async function policyFor(key: string, env: CacheEnv): Promise<KeyPolicy> {
  const yearMatch = key.match(/year=(\d+)/);
  if (yearMatch && Number(yearMatch[1]) < CURRENT_YEAR) {
    return { ttl: TTL_FOREVER, edgeMaxAge: 604_800, state: "static", settledAt: null, sk: null };
  }
  if (key.startsWith("meetings") || key.startsWith("sessions")) {
    return { ttl: TTL_1H, edgeMaxAge: 300, state: "static", settledAt: null, sk: null };
  }
  const skMatch = key.match(/session_key=(\d+)/);
  if (skMatch) {
    const sk = Number(skMatch[1]);
    const w = await getSessionWindow(sk, env.F1_DATA, fetchUpstreamOnce);
    const state = classifyState(w);
    switch (state) {
      case "upcoming": return { ttl: TTL_5M, edgeMaxAge: 60, state, settledAt: null, sk };
      case "live": return { ttl: TTL_1M, edgeMaxAge: 30, state, settledAt: null, sk };
      case "recent": return { ttl: TTL_15M, edgeMaxAge: 300, state, settledAt: null, sk };
      case "settled": return { ttl: TTL_FOREVER, edgeMaxAge: 604_800, state, settledAt: w ? settledAt(w) : null, sk };
      default: return { ttl: TTL_15M, edgeMaxAge: 300, state: "unknown", settledAt: null, sk };
    }
  }
  // championship_* by meeting_key, and anything else: treat as recent.
  return { ttl: TTL_15M, edgeMaxAge: 300, state: "unknown", settledAt: null, sk: null };
}

async function isFresh(obj: R2Object, pol: KeyPolicy, env: CacheEnv): Promise<boolean> {
  const fetchedAt = obj.customMetadata?.fetchedAt ? Number(obj.customMetadata.fetchedAt) : obj.uploaded.getTime();
  if (pol.ttl === TTL_FOREVER) {
    if (pol.settledAt != null && fetchedAt < pol.settledAt) return false;      // frozen live snapshot
    if (pol.sk != null && fetchedAt < await purgeEpoch(env.F1_DATA, pol.sk)) return false;
    return true;
  }
  return Date.now() - fetchedAt < pol.ttl;
}

// ---------------------------------------------------------------------------
// Resolver — shared by the /api/f1 proxy, the bundle route, recap, cards, cron
// ---------------------------------------------------------------------------

export interface Resolved {
  status: number;
  body: string;
  xcache: "HIT" | "MISS" | "STALE" | "ERROR";
  policy: KeyPolicy;
  fetchedAt: number | null;
  upstreamCalls: number;
}

/** Resolve one OpenF1 resource (path with query) through R2 and, when
 *  allowed by its session state, upstream. Never slices telemetry — callers
 *  that want a date window do that on the returned full body. */
export async function resolveResource(apiPath: string, env: CacheEnv, ctx: ExecutionContext | null): Promise<Resolved> {
  const key = normalizeKey(apiPath);
  const endpoint = key.split("?")[0];
  const isTelemetry = TELEMETRY_ENDPOINTS.includes(endpoint);
  const policy = await policyFor(key, env);
  let upstreamCalls = 0;

  const cached = await env.F1_DATA.get(key);
  const cachedAt = cached ? (cached.customMetadata?.fetchedAt ? Number(cached.customMetadata.fetchedAt) : cached.uploaded.getTime()) : null;

  if (cached && await isFresh(cached, policy, env)) {
    return { status: 200, body: await cached.text(), xcache: "HIT", policy, fetchedAt: cachedAt, upstreamCalls };
  }

  // Live: the upstream is paywalled — serve what we have rather than pay for
  // a 401. With nothing cached, one call so the client sees the paywall body.
  if (policy.state === "live" && cached) {
    return { status: 200, body: await cached.text(), xcache: "STALE", policy, fetchedAt: cachedAt, upstreamCalls };
  }

  const fetchPath = isTelemetry ? "/" + key : apiPath;
  let upstream: { ok: boolean; status: number; body: string } | null = null;
  try { upstreamCalls++; upstream = await fetchUpstreamOnce(fetchPath); } catch { upstream = null; }

  if (upstream && upstream.ok) {
    const persist = env.F1_DATA.put(key, upstream.body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { fetchedAt: String(Date.now()) },
    });
    if (ctx) ctx.waitUntil(persist); else await persist;
    return { status: 200, body: upstream.body, xcache: "MISS", policy, fetchedAt: Date.now(), upstreamCalls };
  }

  // OpenF1 says 404 for an empty result. Once the session is settled that
  // emptiness is final — store [] so the next reader doesn't pay for it.
  if (upstream && upstream.status === 404 && policy.state === "settled") {
    const persist = env.F1_DATA.put(key, "[]", {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { fetchedAt: String(Date.now()), empty: "1" },
    });
    if (ctx) ctx.waitUntil(persist); else await persist;
    return { status: 200, body: "[]", xcache: "MISS", policy, fetchedAt: Date.now(), upstreamCalls };
  }

  if (cached) {
    return { status: 200, body: await cached.text(), xcache: "STALE", policy, fetchedAt: cachedAt, upstreamCalls };
  }
  // Pass the upstream status and body through: the client keys the live
  // paywall off a 401 whose detail mentions "Live F1 session", and treats a
  // 429 as "pending".
  const status = upstream?.status ?? 502;
  const body = upstream?.body && (status === 401 || status === 429) ? upstream.body : JSON.stringify({ error: "OpenF1 API unavailable" });
  return { status, body, xcache: "ERROR", policy, fetchedAt: null, upstreamCalls };
}

// ---------------------------------------------------------------------------
// HTTP handler for /api/f1/*
// ---------------------------------------------------------------------------

export async function handleF1Request(request: Request, env: CacheEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const apiPath = url.pathname.replace(/^\/api\/f1/, "") + url.search;
  const endpoint = url.pathname.replace(/^\/api\/f1\//, "").split("/")[0];

  const record = (status: string, state: string, upstreamCalls = 0) =>
    env.ANALYTICS?.writeDataPoint?.({
      blobs: [endpoint, status, state],
      doubles: [1, upstreamCalls],
      indexes: [endpoint],
    });

  if (!ENDPOINT_ALLOWLIST.has(endpoint)) {
    record("blocked", "static");
    return new Response(JSON.stringify({ error: "Unknown endpoint" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const cache = caches.default;
  const ck = edgeCacheKey(url.origin, apiPath);
  const edged = await cache.match(ck);
  if (edged) {
    record("edge", edged.headers.get("X-Session-State") ?? "");
    return edged;
  }

  const isTelemetry = TELEMETRY_ENDPOINTS.includes(endpoint);
  const dateFilters = isTelemetry ? getDateFilters(url) : null;

  const r = await resolveResource(apiPath, env, ctx);
  let body = r.body;
  if (r.status === 200 && dateFilters) {
    try { body = JSON.stringify(sliceByDate(JSON.parse(body), dateFilters)); } catch { /* leave as is */ }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cache": r.xcache,
    "X-Session-State": String(r.policy.state),
    "X-Upstream-Calls": String(r.upstreamCalls),
  };
  record(r.xcache.toLowerCase(), String(r.policy.state), r.upstreamCalls);

  if (r.xcache === "ERROR") {
    return new Response(body, { status: r.status, headers });
  }
  if (r.xcache === "STALE") {
    headers["Cache-Control"] = "public, max-age=60, s-maxage=30";
    return new Response(body, { status: 200, headers });
  }
  const swr = r.policy.ttl === TTL_FOREVER ? ", stale-while-revalidate=86400" : "";
  headers["Cache-Control"] = `public, max-age=60, s-maxage=${r.policy.edgeMaxAge}${swr}`;
  const resp = new Response(body, { status: 200, headers });
  ctx.waitUntil(cache.put(ck, resp.clone()));
  return resp;
}
