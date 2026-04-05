const PROXY = "https://corsproxy.io/?";
const API = "https://api.openf1.org/v1";

const apiCache: Record<string, unknown> = {};

export async function api(path: string, retries = 3) {
  if (apiCache[path]) return apiCache[path];
  const urls = [
    API + path,
    PROXY + encodeURIComponent(API + path)
  ];
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          apiCache[path] = data;
          return data;
        }
      } catch (e) { /* try next */ }
    }
  }
  throw new Error("Failed to fetch: " + path);
}
