const OPENF1 = "https://api.openf1.org/v1";
const CURRENT_YEAR = new Date().getFullYear();

// TTLs in milliseconds
const TTL_FOREVER = Infinity;
const TTL_1H = 3_600_000;
const TTL_5M = 300_000;

interface Env {
  F1_DATA: R2Bucket;
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

  // Everything else (session data): 5 min for current year
  // Historical session data will be detected by the caller checking year
  return TTL_5M;
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

/**
 * Main handler: transparent read-through R2 cache for OpenF1 API.
 *
 * 1. Strips /api/f1 prefix to get the OpenF1 path
 * 2. Checks R2 for cached response
 * 3. If fresh hit, returns it
 * 4. If miss or stale, fetches from OpenF1, caches in R2, returns
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

  // Try R2 first
  const cached = await env.F1_DATA.get(key);
  if (cached && isFresh(cached)) {
    let body = await cached.text();
    // For telemetry with date filters, slice the full blob
    if (dateFilters) {
      const sliced = sliceByDate(JSON.parse(body), dateFilters);
      body = JSON.stringify(sliced);
    }
    const maxAge = getTTL(key) === Infinity ? 86400 : 60;
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${maxAge}`,
        "X-Cache": "HIT",
      },
    });
  }

  // Fetch from OpenF1 — for telemetry, fetch full session (no date filter)
  // so we cache the complete blob and can slice future requests from R2
  const fetchPath = isTelemetry ? "/" + key : apiPath;
  let res: Response;
  try {
    res = await fetch(OPENF1 + fetchPath);
  } catch (e) {
    // If OpenF1 is down but we have stale cache, serve it
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "X-Cache": "STALE",
        },
      });
    }
    return new Response(JSON.stringify({ error: "OpenF1 API unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!res.ok) {
    // Serve stale cache if available
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "X-Cache": "STALE",
        },
      });
    }
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fullBody = await res.text();

  // Store full blob in R2 (non-blocking)
  ctx.waitUntil(
    env.F1_DATA.put(key, fullBody, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { fetchedAt: String(Date.now()) },
    }),
  );

  // For telemetry with date filters, slice before returning
  let responseBody = fullBody;
  if (dateFilters) {
    const sliced = sliceByDate(JSON.parse(fullBody), dateFilters);
    responseBody = JSON.stringify(sliced);
  }

  const maxAge = getTTL(key) === Infinity ? 86400 : 60;
  return new Response(responseBody, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Cache": "MISS",
    },
  });
}
