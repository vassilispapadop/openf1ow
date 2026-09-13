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

export async function computeInsights(sk: number, env: CacheEnv, ctx: ExecutionContext): Promise<{ status: number; body: string; state: string; cached: boolean }> {
  const key = `insights/${sk}.v${VERSION}.json`;
  try {
    const obj = await env.F1_DATA.get(key);
    if (obj) return { status: 200, body: await obj.text(), state: "settled", cached: true };
  } catch { /* compute */ }

  const a = await assembleBundle(sk, env, ctx);
  if (!a.ok) return { status: a.status, body: a.body, state: "unknown", cached: false };
  const model = buildSessionModel(inputsFromBundle(a.payload));
  const facts = buildFacts(model);
  const payload: InsightsPayload = {
    ...facts,
    meta: { sessionKey: sk, state: a.state, generatedAt: new Date().toISOString(), version: VERSION, missing: a.payload.meta.missing },
  };
  const body = JSON.stringify(payload);
  if (a.state === "settled" && !a.payload.meta.partial) {
    ctx.waitUntil(env.F1_DATA.put(key, body, { httpMetadata: { contentType: "application/json" }, customMetadata: { fetchedAt: String(Date.now()) } }));
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
