const API = "/api/f1";

const apiCache: Record<string, unknown> = {};

// Tiny pub-sub for the OpenF1 live-session paywall. api() flips the flag
// on the first 401 with a paywall detail; any successful response flips
// it off. The LiveSessionBanner subscribes.
let liveGate = false;
const liveListeners = new Set<() => void>();

export function isLiveSessionGated(): boolean {
  return liveGate;
}

export function onLiveSessionChange(fn: () => void): () => void {
  liveListeners.add(fn);
  return () => { liveListeners.delete(fn); };
}

function setLiveGate(next: boolean) {
  if (liveGate === next) return;
  liveGate = next;
  liveListeners.forEach(fn => fn());
}

export async function api(path: string, retries = 2) {
  if (apiCache[path]) return apiCache[path];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 500));
    try {
      const r = await fetch(API + path);
      if (r.ok) {
        setLiveGate(false);
        const data = await r.json();
        apiCache[path] = data;
        return data;
      }
      // OpenF1 paywalls the public API during live sessions; the gate
      // stays up until the session ends, so retrying is futile.
      if (r.status === 401) {
        const body = await r.json().catch(() => null);
        const detail = typeof body?.detail === "string" ? body.detail : "";
        if (detail.includes("Live F1 session")) {
          setLiveGate(true);
          throw new Error("Live session in progress — OpenF1 has restricted public data access until it ends. Try again after the chequered flag.");
        }
        throw new Error("Unauthorized: " + path);
      }
      // 429 = OpenF1 rate-limiting. Common during and right after a live
      // session (data isn't published/cached yet). Tag it so the UI can show a
      // calm "waiting for data" state + auto-retry instead of a raw error.
      if (r.status === 429) {
        const e = new Error("The F1 data source is rate-limiting this session's timing data — this is normal during and just after a live session, and clears once the data is published.");
        (e as Error & { code?: string }).code = "RATE_LIMITED";
        lastError = e;
      } else {
        lastError = new Error(`HTTP ${r.status}: ${path}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Live session")) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Failed to fetch: " + path);
}

/** One response with everything the engine's SessionModel ingests. Same
 *  error semantics as api(): a live-session 401 flips the gate, a 429 is
 *  tagged RATE_LIMITED so the page shows the pending state and retries. */
export async function fetchSessionBundle(sessionKey: string | number, retries = 1) {
  const path = `/api/session/${sessionKey}/bundle`;
  if (apiCache[path]) return apiCache[path];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    try {
      const r = await fetch(path);
      if (r.ok) {
        setLiveGate(false);
        const data = await r.json();
        // Live and partial bundles must not stick in the tab's memory cache.
        if (r.headers.get("X-Session-State") === "settled" && !data?.meta?.partial) apiCache[path] = data;
        return data;
      }
      if (r.status === 401) {
        const body = await r.json().catch(() => null);
        const detail = typeof body?.detail === "string" ? body.detail : "";
        if (detail.includes("Live F1 session")) {
          setLiveGate(true);
          throw new Error("Live session in progress — OpenF1 has restricted public data access until it ends. Try again after the chequered flag.");
        }
        throw new Error("Unauthorized: " + path);
      }
      if (r.status === 429) {
        const e = new Error("The F1 data source is rate-limiting this session's timing data — this is normal during and just after a live session, and clears once the data is published.");
        (e as Error & { code?: string }).code = "RATE_LIMITED";
        lastError = e;
      } else {
        lastError = new Error(`HTTP ${r.status}: ${path}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Live session")) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Failed to fetch: " + path);
}
