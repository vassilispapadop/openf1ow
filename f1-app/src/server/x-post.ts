// Post a stored draft to X (OAuth 1.0a user context, signed with WebCrypto).
// Off unless all four X_* secrets exist; the cron only calls it when X_AUTOPOST=1.
// A marker at social/{sk}.posted.json makes it idempotent — a session is posted once.

import { loadRaceIndex } from "./recap";
import { postBody, shareCardUrl, type DraftSet } from "./social-draft";

export interface XEnv {
  F1_DATA: R2Bucket;
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> };
  X_API_KEY?: string; X_API_SECRET?: string; X_ACCESS_TOKEN?: string; X_ACCESS_SECRET?: string;
  X_AUTOPOST?: string;
}

const enc = encodeURIComponent;
const rfc = (s: string) => enc(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export const xConfigured = (e: XEnv) => !!(e.X_API_KEY && e.X_API_SECRET && e.X_ACCESS_TOKEN && e.X_ACCESS_SECRET);

async function oauthHeader(method: string, url: string, e: XEnv): Promise<string> {
  const p: Record<string, string> = {
    oauth_consumer_key: e.X_API_KEY!, oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: e.X_ACCESS_TOKEN!, oauth_version: "1.0",
  };
  // JSON and multipart bodies are not part of the signature base string.
  const base = [method, rfc(url), rfc(Object.keys(p).sort().map(k => `${rfc(k)}=${rfc(p[k])}`).join("&"))].join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${rfc(e.X_API_SECRET!)}&${rfc(e.X_ACCESS_SECRET!)}`), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base)))));
  p.oauth_signature = sig;
  return "OAuth " + Object.keys(p).sort().map(k => `${rfc(k)}="${rfc(p[k])}"`).join(", ");
}

async function uploadImage(png: ArrayBuffer, e: XEnv): Promise<string> {
  const url = "https://api.x.com/2/media/upload";
  const fd = new FormData();
  fd.append("media", new Blob([png], { type: "image/png" }), "card.png");
  fd.append("media_category", "tweet_image");
  const r = await fetch(url, { method: "POST", headers: { Authorization: await oauthHeader("POST", url, e) }, body: fd });
  const j: any = await r.json().catch(() => ({}));
  const id = j?.data?.id ?? j?.media_id_string;
  if (!r.ok || !id) throw new Error(`media upload ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return String(id);
}

export interface PostResult { status: "posted" | "already-posted" | "no-keys" | "no-drafts" | "error"; tweetId?: string; imaged?: boolean; error?: string }

/** Post draft `n` (1-based) of a session. Never posts twice for one session. */
export async function postDraft(sk: number, e: XEnv, opts: { n?: number; origin?: string } = {}): Promise<PostResult> {
  if (!xConfigured(e)) return { status: "no-keys" };
  const markerKey = `social/${sk}.posted.json`;
  if (await e.F1_DATA.head(markerKey)) return { status: "already-posted" };
  const o = await e.F1_DATA.get(`social/${sk}.json`);
  if (!o) return { status: "no-drafts" };
  const set = JSON.parse(await o.text()) as DraftSet;
  const draft = set.drafts[(opts.n ?? 1) - 1];
  if (!draft) return { status: "no-drafts" };
  const origin = opts.origin ?? "https://www.openf1ow.com";

  try {
    // Image is best effort: a missing card must not stop the post.
    let mediaId: string | undefined;
    try {
      const mk = set.meetingKey ?? Number(/\/\d{4}\/(\d+)\//.exec(draft.url)?.[1]);
      const idx = e.ASSETS ? await loadRaceIndex(e.ASSETS, origin) : null;
      for (const [year, races] of Object.entries(idx?.byYear ?? {})) {
        const hit = (races as { slug: string; meetingKey: number }[]).find(r => r.meetingKey === mk);
        if (!hit) continue;
        const img = await fetch(shareCardUrl(origin, Number(year), hit.slug));
        if (img.ok) mediaId = await uploadImage(await img.arrayBuffer(), e);
        break;
      }
    } catch { /* post without the image */ }

    const url = "https://api.x.com/2/tweets";
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: await oauthHeader("POST", url, e), "Content-Type": "application/json" },
      body: JSON.stringify({ text: postBody(draft), ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data?.id) return { status: "error", error: `post ${r.status}: ${JSON.stringify(j).slice(0, 300)}` };
    await e.F1_DATA.put(markerKey, JSON.stringify({ tweetId: j.data.id, draft: draft.id, at: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    return { status: "posted", tweetId: j.data.id, imaged: !!mediaId };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
