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
      lastError = new Error(`HTTP ${r.status}: ${path}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Live session")) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Failed to fetch: " + path);
}
