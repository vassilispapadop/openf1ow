// /admin — a one-page operator UI: log in, review the proposed X posts per race
// session, edit, and post. Auth is a single user from two secrets (ADMIN_USER,
// ADMIN_PASSWORD); a login sets an HttpOnly cookie signed with the password, so
// changing the password logs everyone out. Failed logins are rate-limited per IP.

import { postDraft, xConfigured, type XEnv } from "./x-post";
import type { DraftSet } from "./social-draft";

export interface AdminUiEnv extends XEnv {
  ADMIN_USER?: string;
  ADMIN_PASSWORD?: string;
}

const COOKIE = "adm";
const TTL_S = 12 * 3600;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

const te = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, te.encode(msg)));
}
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

async function signedIn(request: Request, env: AdminUiEnv): Promise<boolean> {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  const m = new RegExp(`(?:^|; )${COOKIE}=([^;]+)`).exec(request.headers.get("Cookie") || "");
  const [exp, sig] = (m?.[1] || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return same(sig, await hmac(env.ADMIN_PASSWORD + "|" + env.ADMIN_USER, exp));
}

async function tooManyFails(env: AdminUiEnv, ip: string): Promise<{ key: string; fails: number[] }> {
  const key = `meta/login-fail/${ip.replace(/[^0-9a-fA-F:.]/g, "_")}.json`;
  let fails: number[] = [];
  try { const o = await env.F1_DATA.get(key); if (o) fails = JSON.parse(await o.text()); } catch { /* none */ }
  return { key, fails: fails.filter(t => Date.now() - t < FAIL_WINDOW_MS) };
}

async function listProposals(env: AdminUiEnv) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const l = await env.F1_DATA.list({ prefix: "social/", cursor });
    for (const o of l.objects) if (/^social\/\d+\.json$/.test(o.key)) keys.push(o.key);
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  const sets: DraftSet[] = [];
  for (const k of keys) {
    try { const o = await env.F1_DATA.get(k); if (o) sets.push(JSON.parse(await o.text())); } catch { /* skip */ }
  }
  // Newest session first (by when it ran, not when its drafts were last rebuilt).
  sets.sort((a, b) => (b.sessionDate ?? "").localeCompare(a.sessionDate ?? "") || b.sessionKey - a.sessionKey);
  const out = [];
  for (const s of sets.slice(0, 40)) {
    const drafts = [];
    for (let i = 0; i < s.drafts.length; i++) {
      const m = await env.F1_DATA.get(`social/${s.sessionKey}.posted.${i + 1}.json`);
      let posted: { tweetId?: string; at?: string } | null = null;
      if (m) { try { posted = JSON.parse(await m.text()); } catch { posted = {}; } }
      const d = s.drafts[i];
      // The post is "<text>\n\n<link>"; the page edits the text part only.
      drafts.push({ n: i + 1, text: d.text, url: d.url, posted });
    }
    out.push({ sessionKey: s.sessionKey, title: (s.drafts[0]?.text || "").split("\n")[0] || `Session ${s.sessionKey}`, generatedAt: s.sessionDate ?? s.generatedAt, drafts });
  }
  return out;
}

export async function handleAdminUi(request: Request, env: AdminUiEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  const route = url.pathname.replace("/api/adminui/", "");

  if (route === "login" && request.method === "POST") {
    if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return json({ error: "login not configured" }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { key, fails } = await tooManyFails(env, ip);
    if (fails.length >= MAX_FAILS) return json({ error: "too many attempts, try again in 15 minutes" }, 429);
    let body: { email?: string; password?: string } = {};
    try { body = await request.json(); } catch { /* fall through */ }
    const ok = same(String(body.email ?? "").toLowerCase(), env.ADMIN_USER.toLowerCase()) && same(String(body.password ?? ""), env.ADMIN_PASSWORD);
    if (!ok) {
      await env.F1_DATA.put(key, JSON.stringify([...fails, Date.now()]));
      return json({ error: "wrong email or password" }, 401);
    }
    const exp = String(Math.floor(Date.now() / 1000) + TTL_S);
    const cookie = `${COOKIE}=${exp}.${await hmac(env.ADMIN_PASSWORD + "|" + env.ADMIN_USER, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_S}`;
    return json({ ok: true }, 200, { "Set-Cookie": cookie });
  }
  if (route === "logout" && request.method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  if (!(await signedIn(request, env))) return json({ error: "not signed in" }, 401);

  if (route === "proposals" && request.method === "GET") {
    return json({ xReady: xConfigured(env), sessions: await listProposals(env) });
  }
  if (route === "post" && request.method === "POST") {
    if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ error: "json only" }, 415);
    const b = (await request.json().catch(() => ({}))) as { sessionKey?: number; n?: number; text?: string };
    if (!b.sessionKey || !b.n) return json({ error: "sessionKey and n required" }, 400);
    const r = await postDraft(Number(b.sessionKey), env, { n: Number(b.n), text: b.text, origin: url.origin });
    return json(r, r.status === "error" ? 502 : 200);
  }
  return json({ error: "not found" }, 404);
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>OpenF1ow admin</title>
<style>
:root{--bg:#f6f6f8;--fg:#15151a;--muted:#6a6a72;--card:#fff;--line:#e2e2e8;--accent:#e10600;--ok:#0a7d3b}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e11;--fg:#e8e8ec;--muted:#8d8d96;--card:#17171c;--line:#2a2a31;--ok:#3ecf7a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:20px;margin:0 0 4px}.muted{color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:14px 0}
input,textarea{width:100%;box-sizing:border-box;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit}
textarea{min-height:96px;resize:vertical}
button{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:8px}
.ok{color:var(--ok)}.err{color:var(--accent)}.hdr{display:flex;justify-content:space-between;align-items:center}
</style></head><body><main id="app"></main>
<script>
const $=document.getElementById('app');
const api=async(p,o)=>{const r=await fetch('/api/adminui/'+p,Object.assign({headers:{'Content-Type':'application/json'}},o));let j={};try{j=await r.json()}catch(e){}return {r,j}};
const el=(t,a={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a))k==='class'?e.className=v:k.startsWith('on')?e.addEventListener(k.slice(2),v):e.setAttribute(k,v);for(const x of c)e.append(x);return e};
function login(msg){
  const email=el('input',{type:'email',placeholder:'Email',autocomplete:'username'}),pw=el('input',{type:'password',placeholder:'Password',autocomplete:'current-password'}),m=el('div',{class:'err muted'},msg||'');
  const go=async()=>{const{r,j}=await api('login',{method:'POST',body:JSON.stringify({email:email.value,password:pw.value})});if(r.ok)load();else{m.textContent=j.error||'failed'}};
  pw.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  $.replaceChildren(el('h1',{},'OpenF1ow admin'),el('div',{class:'card'},email,el('div',{style:'height:8px'}),pw,el('div',{class:'row'},m,el('button',{onclick:go},'Sign in'))));
}
const weighted=t=>t.trim().length+2+23;
async function load(){
  const{r,j}=await api('proposals');if(r.status===401)return login();
  const head=el('div',{class:'hdr'},el('div',{},el('h1',{},'Proposed X posts'),el('div',{class:'muted'},j.xReady?'X keys configured':'X keys missing — posting will fail until they are set')),el('button',{class:'ghost',onclick:async()=>{await api('logout',{method:'POST'});login()}},'Sign out'));
  const out=[head];
  if(!j.sessions.length)out.push(el('div',{class:'card muted'},'No proposals yet. They appear after each session is processed.'));
  for(const s of j.sessions){
    const card=el('div',{class:'card'},el('strong',{},s.title),el('div',{class:'muted'},'session '+s.sessionKey+' · '+s.generatedAt.slice(0,16).replace('T',' ')));
    for(const d of s.drafts){
      const ta=el('textarea',{});ta.value=d.text;const cnt=el('span',{class:'muted'});const msg=el('div',{class:'muted'});
      const upd=()=>{const w=weighted(ta.value);cnt.textContent=w+'/280';cnt.className=w>280?'err':'muted'};ta.addEventListener('input',upd);upd();
      const link=el('div',{class:'muted'},'+ link: '+d.url);
      const row=el('div',{class:'row'},cnt);
      if(d.posted){ta.disabled=true;msg.className='ok';msg.textContent='Posted '+(d.posted.at||'').slice(0,16).replace('T',' ');if(d.posted.tweetId)msg.append(' · ',el('a',{href:'https://x.com/openf1ow/status/'+d.posted.tweetId,target:'_blank',rel:'noopener'},'view'))}
      else{const b=el('button',{onclick:async()=>{if(!confirm('Post this to @openf1ow now?'))return;b.disabled=true;msg.className='muted';msg.textContent='Posting…';const{j:rj}=await api('post',{method:'POST',body:JSON.stringify({sessionKey:s.sessionKey,n:d.n,text:ta.value})});if(rj.status==='posted'){load()}else{b.disabled=false;msg.className='err';msg.textContent=rj.error||rj.status}}},'Post to X');row.append(b)}
      card.append(el('div',{style:'height:10px'}),ta,link,row,msg);
    }
    out.push(card);
  }
  $.replaceChildren(...out);
}
load();
</script></body></html>`;
