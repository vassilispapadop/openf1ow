// Operator endpoints, behind a bearer secret (ADMIN_TOKEN).
//
//   POST /api/admin/purge?session_key=SK     invalidate everything cached for a session
//   POST /api/admin/refresh?session_key=SK   purge, then warm the standard endpoint set
//   POST /api/admin/cron                     run one scheduled tick now (see cron.ts)
//   POST /api/admin/cron?session_key=SK      process that session now, whatever its age
//
// Purging writes an epoch to meta/purge/{sk}.json — the freshness floor in
// r2-cache.ts treats any object fetched before it as stale — and deletes the
// per-session artifact prefixes. Unauthorised requests get a 404, not a 401,
// so the routes are invisible to scanners.

import { resolveResource, type CacheEnv } from "./r2-cache";

export interface AdminEnv extends CacheEnv {
  ADMIN_TOKEN?: string;
}

export const STANDARD_ENDPOINTS = [
  "drivers", "laps", "stints", "pit", "position", "race_control", "session_result", "weather", "intervals", "overtakes", "starting_grid",
];

const ARTIFACT_PREFIXES = (sk: number) => [`derived/${sk}/`, `insights/${sk}`, `telemetry/${sk}/`];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(request: Request, env: AdminEnv): boolean {
  if (!env.ADMIN_TOKEN) return false;
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  return token.length > 0 && timingSafeEqual(token, env.ADMIN_TOKEN);
}

async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ prefix, cursor, limit: 500 });
    if (list.objects.length) {
      await bucket.delete(list.objects.map(o => o.key));
      n += list.objects.length;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return n;
}

export async function handleAdminRequest(request: Request, env: AdminEnv, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/")) return null;
  if (!authorised(request, env)) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sk = Number(url.searchParams.get("session_key"));
  if (!Number.isFinite(sk) || sk <= 0) return json({ error: "session_key required" }, 400);

  const action = url.pathname.replace("/api/admin/", "");
  if (action === "cron") {
    const { runScheduledTick } = await import("./cron");
    const report = await runScheduledTick(env, ctx, { force: sk || undefined });
    return json(report);
  }
  if (action !== "purge" && action !== "refresh") return json({ error: "unknown action" }, 404);

  const { epoch, deleted } = await purgeSession(sk, env);
  const warmed = action === "refresh" ? await warmSession(sk, env, ctx) : {};
  return json({ action, session_key: sk, purgeEpoch: epoch, deleted, warmed });
}

/** Write the purge epoch (freshness floor) and drop the per-session artifacts. */
export async function purgeSession(sk: number, env: CacheEnv): Promise<{ epoch: number; deleted: Record<string, number> }> {
  const epoch = Date.now();
  await env.F1_DATA.put(`meta/purge/${sk}.json`, JSON.stringify({ epoch }), { httpMetadata: { contentType: "application/json" } });
  const deleted: Record<string, number> = {};
  for (const p of ARTIFACT_PREFIXES(sk)) deleted[p] = await deletePrefix(env.F1_DATA, p);
  return { epoch, deleted };
}

/** Resolve the standard endpoint set for a session, sequentially so the
 *  upstream budget (3 req/s) is respected. Returns status per endpoint. */
export async function warmSession(sk: number, env: CacheEnv, ctx: ExecutionContext, endpoints: readonly string[] = STANDARD_ENDPOINTS): Promise<Record<string, string>> {
  const warmed: Record<string, string> = {};
  for (const ep of endpoints) {
    try {
      const r = await resolveResource(`/${ep}?session_key=${sk}`, env, ctx);
      warmed[ep] = `${r.status} ${r.xcache}`;
    } catch (e) {
      warmed[ep] = "error " + (e instanceof Error ? e.message : String(e));
    }
    await new Promise(r => setTimeout(r, 350));
  }
  return warmed;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
