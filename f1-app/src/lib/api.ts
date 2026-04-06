const API = "/api/f1";

const apiCache: Record<string, unknown> = {};

export async function api(path: string, retries = 2) {
  if (apiCache[path]) return apiCache[path];
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 500));
    try {
      const r = await fetch(API + path);
      if (r.ok) {
        const data = await r.json();
        apiCache[path] = data;
        return data;
      }
    } catch { /* retry */ }
  }
  throw new Error("Failed to fetch: " + path);
}
