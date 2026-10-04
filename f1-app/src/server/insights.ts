// GET /api/session/:sk/insights — the engine run server-side on the same
// bundle the client uses: verdicts plus compact facts. Persisted per session
// once it has settled (versioned by engine schema), so the home page, the
// recap and the OG cards quote exactly what the analysis page shows, and a
// finished race's first paint is one small GET.

import type { CacheEnv } from "./r2-cache";
import { assembleBundle, edgeForState } from "./bundle";
import { inputsFromBundle } from "../engine/bundle.ts";
import { buildSessionModel } from "../engine/session/build.ts";
import { buildFacts, type AnalysisFacts } from "../engine/summary/facts.ts";

const VERSION = 1;

export interface InsightsPayload extends AnalysisFacts {
  meta: { sessionKey: number; state: string; generatedAt: string; version: number; missing: string[] };
}

/** The state recorded in a stored payload's meta, without parsing the whole
 *  thing: it sits in the trailing meta object. */
function storedState(body: string): string | null {
  const m = /"meta":\{[^{}]*"state":"(recent|settled|live|upcoming|unknown)"/.exec(body.slice(-600));
  return m ? m[1] : null;
}

/** `force` skips the stored artifact and recomputes: the cron's second pass,
 *  48 h after a session, uses it to replace what the first pass stored while
 *  the session was still "recent" (late laps, penalties, corrected results). */
export async function computeInsights(sk: number, env: CacheEnv, ctx: ExecutionContext, opts: { force?: boolean } = {}): Promise<{ status: number; body: string; state: string; cached: boolean }> {
  const key = `insights/${sk}.v${VERSION}.json`;
  if (!opts.force) {
    try {
      const obj = await env.F1_DATA.get(key);
      // The state it was computed in is in the payload's meta (and, for
      // Worker-written objects, in the object metadata too), so a recent
      // artifact is served with a recent edge TTL and the client doesn't pin
      // it. Objects from before the state was recorded are settled.
      if (obj) {
        const body = await obj.text();
        return { status: 200, body, state: obj.customMetadata?.state ?? storedState(body) ?? "settled", cached: true };
      }
    } catch { /* compute */ }
  }

  const a = await assembleBundle(sk, env, ctx);
  if (!a.ok) return { status: a.status, body: a.body, state: "unknown", cached: false };
  // One parse of the spliced bundle; the engine runs on it here, server-side.
  const model = buildSessionModel(inputsFromBundle(JSON.parse(a.body)));
  const facts = buildFacts(model);
  const payload: InsightsPayload = {
    ...facts,
    meta: { sessionKey: sk, state: a.state, generatedAt: new Date().toISOString(), version: VERSION, missing: a.meta.missing },
  };
  const body = JSON.stringify(payload);
  // Store it for recent sessions too, not only settled ones. The engine run
  // is far beyond what a request may spend on the Free plan (error 1102), so
  // an unstored artifact means 48 h of 503s for the home page's latest-race
  // card after every race. The cron's second pass recomputes it with force.
  if ((a.state === "settled" || a.state === "recent") && !a.meta.partial) {
    ctx.waitUntil(env.F1_DATA.put(key, body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { fetchedAt: String(Date.now()), state: a.state },
    }));
  }
  return { status: 200, body, state: a.state, cached: false };
}

export async function handleSessionInsightsRequest(request: Request, env: CacheEnv, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/session\/(\d+)\/insights\/?$/);
  if (!m) return null;
  const sk = Number(m[1]);
  const r = await computeInsights(sk, env, ctx);
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Cache": r.cached ? "HIT" : "MISS", "X-Session-State": r.state };
  if (r.status !== 200) {
    if (r.status === 429) headers["Retry-After"] = "12";
    return new Response(r.body, { status: r.status, headers });
  }
  headers["Cache-Control"] = `public, max-age=60, s-maxage=${edgeForState(r.state as any, false)}`;
  return new Response(r.body, { status: 200, headers });
}
