const OPENF1 = "https://api.openf1.org/v1";
const CURRENT_YEAR = new Date().getFullYear();

// TTLs in milliseconds
const TTL_FOREVER = Infinity;
const TTL_1H = 3_600_000;
const TTL_5M = 300_000;

interface Env {
  F1_DATA: R2Bucket;
  // Optional Workers Analytics Engine dataset for long-term usage history.
  ANALYTICS?: { writeDataPoint: (event: AnalyticsEngineDataPoint) => void };
}

interface AnalyticsEngineDataPoint {
  blobs?: (string | null)[];
  doubles?: number[];
  indexes?: string[];
}

/** Telemetry endpoints that are stored as full-session blobs in R2 */
const TELEMETRY_ENDPOINTS = ["car_data", "location"];

/**
 * Normalize an OpenF1 API path into a stable R2 key.
 * Strips leading slash and sorts query params alphabetically.
 * For telemetry endpoints, strips date filters so the key matches
 * the full-session blob stored by the scraper.
 */
function normalizeKey(path: string): string {
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

/**
 * Edge cache key: a canonical URL that keeps ALL query params (including the
 * date filters that normalizeKey strips for telemetry). This keeps each
 * client-visible date slice as a distinct edge-cache entry, so the expensive
 * JSON parse + slice happens once per (session, date-range) per edge node and
 * is then served straight from cache — instead of re-parsing the multi-MB
 * full-session blob on every request (the cause of the `exceededResources`
 * 503s on /api/f1/car_data and /api/f1/location).
 */
function edgeCacheKey(apiPath: string): Request {
  const [base, qs] = apiPath.split("?");
  const clean = base.replace(/^\//, "");
  let canon = clean;
  if (qs) {
    const params = [...new URLSearchParams(qs).entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    canon += "?" + params.map(([k, v]) => `${k}=${v}`).join("&");
  }
  return new Request("https://f1-edge-cache.openf1ow/" + canon);
}

/**
 * Extract date filter bounds from query params for telemetry slicing.
 */
function getDateFilters(url: URL): { gte?: string; lte?: string } | null {
  const params = url.searchParams;
  const gte = params.get("date>=") || params.get("date>") || undefined;
  const lte = params.get("date<=") || params.get("date<") || undefined;
  if (!gte && !lte) return null;
  return { gte, lte };
}

/**
 * Filter a telemetry array by date range.
 */
function sliceByDate(data: any[], filters: { gte?: string; lte?: string }): any[] {
  return data.filter((item: any) => {
    if (!item.date) return true;
    if (filters.gte && item.date < filters.gte) return false;
    if (filters.lte && item.date > filters.lte) return false;
    return true;
  });
}

/**
 * Determine TTL for a given R2 key based on its content type.
 * Historical data never expires; current-season data has short TTLs.
 */
function getTTL(key: string): number {
  // Meetings list for past years: never refetch
  const yearMatch = key.match(/year=(\d+)/);
  if (yearMatch && Number(yearMatch[1]) < CURRENT_YEAR) return TTL_FOREVER;

  // Current-year meetings list: refresh hourly
  if (key.startsWith("meetings")) return TTL_1H;

  // Sessions list: refresh hourly
  if (key.startsWith("sessions")) return TTL_1H;

  // All session-keyed data (completed sessions): never expires
  if (key.includes("session_key=")) return TTL_FOREVER;

  return TTL_5M;
}

/**
 * Edge cache lifetime (seconds), derived from the same TTL policy as R2.
 * Immutable historical data is cached at the edge for a week; live data
 * inherits its short R2 TTL so race-weekend freshness is unchanged.
 */
function edgeMaxAge(key: string): number {
  const ttl = getTTL(key);
  if (ttl === TTL_FOREVER) return 604_800; // 1 week
  return Math.floor(ttl / 1000);
}

/**
 * Check if cached R2 object is still fresh based on its custom metadata.
 */
function isFresh(obj: R2Object): boolean {
  const ttl = getTTL(obj.key);
  if (ttl === Infinity) return true;
  // Use custom metadata if set by Worker, otherwise fall back to R2 upload time
  const ts = obj.customMetadata?.fetchedAt
    ? Number(obj.customMetadata.fetchedAt)
    : obj.uploaded.getTime();
  return Date.now() - ts < ttl;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-isolate single-flight: collapse concurrent identical upstream fetches
 * into one request. A burst of cache misses (e.g. everyone opening the same
 * live session) would otherwise fan out into many parallel calls to OpenF1
 * and get rate-limited (429). One retry with backoff smooths transient 429/5xx.
 */
const inflight = new Map<
  string,
  Promise<{ ok: boolean; status: number; body: string }>
>();

async function fetchUpstreamOnce(
  fetchPath: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const existing = inflight.get(fetchPath);
  if (existing) return existing;

  const p = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(OPENF1 + fetchPath);
        // Back off once on rate-limit / upstream error, then accept the result.
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          await sleep(400);
          continue;
        }
        return { ok: res.ok, status: res.status, body: await res.text() };
      } catch (e) {
        lastErr = e;
        if (attempt === 0) {
          await sleep(400);
          continue;
        }
      }
    }
    throw lastErr ?? new Error("upstream fetch failed");
  })();

  inflight.set(fetchPath, p);
  try {
    return await p;
  } finally {
    inflight.delete(fetchPath);
  }
}

/**
 * Main handler: transparent read-through cache for the OpenF1 API.
 *
 *   1. Cloudflare edge cache (caches.default) — fastest; skips R2, parse, upstream
 *   2. R2 read-through cache — persistent, shared across edge nodes
 *   3. OpenF1 origin (single-flight + retry), with stale-R2 fallback on failure
 */
export async function handleF1Request(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  // /api/f1/meetings?year=2024 → /meetings?year=2024
  const apiPath = url.pathname.replace(/^\/api\/f1/, "") + url.search;
  const key = normalizeKey(apiPath);

  const endpoint = url.pathname.replace(/^\/api\/f1\//, "");
  const isTelemetry = TELEMETRY_ENDPOINTS.includes(endpoint);
  const dateFilters = isTelemetry ? getDateFilters(url) : null;

  const cache = caches.default;
  const ck = edgeCacheKey(apiPath);

  const record = (status: string) =>
    env.ANALYTICS?.writeDataPoint?.({
      blobs: [endpoint, status],
      doubles: [1],
      indexes: [endpoint],
    });

  // 1. Edge cache — returns immediately, no R2 read or JSON work.
  const edged = await cache.match(ck);
  if (edged) {
    record("edge");
    return edged;
  }

  // Build a cacheable response, store it at the edge, and record the outcome.
  const finalize = (body: string, xcache: string): Response => {
    const maxAge = edgeMaxAge(key);
    const resp = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        // Short browser TTL keeps clients revalidating; long s-maxage lets the
        // Cloudflare edge absorb the load; SWR avoids origin stampedes.
        "Cache-Control": `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=86400`,
        "X-Cache": xcache,
      },
    });
    ctx.waitUntil(cache.put(ck, resp.clone()));
    record(xcache.toLowerCase());
    return resp;
  };

  // 2. R2 read-through.
  const cached = await env.F1_DATA.get(key);
  if (cached && isFresh(cached)) {
    let body = await cached.text();
    if (dateFilters) {
      body = JSON.stringify(sliceByDate(JSON.parse(body), dateFilters));
    }
    return finalize(body, "HIT");
  }

  // 3. Origin fetch — single-flight + retry. For telemetry, fetch the full
  // session (no date filter) so we cache the complete blob and slice later.
  const fetchPath = isTelemetry ? "/" + key : apiPath;
  let upstream: { ok: boolean; status: number; body: string } | null = null;
  try {
    upstream = await fetchUpstreamOnce(fetchPath);
  } catch {
    upstream = null;
  }

  // 4. On any upstream failure, always prefer stale R2 over erroring.
  if (!upstream || !upstream.ok) {
    if (cached) {
      let body = await cached.text();
      if (dateFilters) {
        body = JSON.stringify(sliceByDate(JSON.parse(body), dateFilters));
      }
      record("stale");
      // Don't poison the edge cache with a long TTL for stale/error data.
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "X-Cache": "STALE",
        },
      });
    }
    record("error");
    const status = upstream?.status ?? 502;
    return new Response(
      JSON.stringify({ error: "OpenF1 API unavailable" }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }

  // 5. Success — persist full blob to R2 (non-blocking), return (sliced) body.
  const fullBody = upstream.body;
  ctx.waitUntil(
    env.F1_DATA.put(key, fullBody, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { fetchedAt: String(Date.now()) },
    }),
  );

  let responseBody = fullBody;
  if (dateFilters) {
    responseBody = JSON.stringify(sliceByDate(JSON.parse(fullBody), dateFilters));
  }
  return finalize(responseBody, "MISS");
}
