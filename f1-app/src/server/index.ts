import { handleF1Request } from "./r2-cache";
import { handleRecapRequest, handleInsightsRequest } from "./recap";
import { handleShareRaceRequest, handleShareDriverRequest } from "./share-card";
import { handleShareImageUpload, handleShareImageRead } from "./share-image";
import { handleSeasonTrendsRequest } from "./season-trends";
import { handleAboutRequest } from "./about";
import { handleSlugRedirect } from "./slug-redirect";

interface Env {
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
  // Google Analytics 4 measurement ID (G-XXXXXXXXXX). Optional — when unset,
  // Worker-rendered pages skip the gtag snippet.
  GA_ID?: string;
  // Workers Analytics Engine dataset for long-term usage history (optional;
  // the /api/f1 cache handler records per-request data points when present).
  ANALYTICS?: {
    writeDataPoint: (event: {
      blobs?: (string | null)[];
      doubles?: number[];
      indexes?: string[];
    }) => void;
  };
}

// ============================================================================
// DYNAMIC OG TAGS
// ============================================================================

const OPENF1_API = "https://api.openf1.org/v1";
const metaCache = new Map<string, { data: any; ts: number }>();
const META_TTL = 3600_000; // 1 hour

async function fetchCached(path: string, r2?: R2Bucket): Promise<any> {
  const cached = metaCache.get(path);
  if (cached && Date.now() - cached.ts < META_TTL) return cached.data;
  // Try R2 first (data may already be cached by the /api/f1 proxy)
  if (r2) {
    try {
      const key = path.replace(/^\//, "");
      const obj = await r2.get(key);
      if (obj) {
        const data = await obj.json();
        metaCache.set(path, { data, ts: Date.now() });
        return data;
      }
    } catch { /* fall through to API */ }
  }
  try {
    const res = await fetch(OPENF1_API + path);
    if (!res.ok) return null;
    const data = await res.json();
    metaCache.set(path, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

const SUB_TAB_LABELS: Record<string, string> = {
  ai: "AI Analysis", replay: "Race Replay", pace: "Race Pace",
  sectors: "Sectors", constructors: "Constructors", evolution: "Lap Evolution",
  degradation: "Tire Degradation", fuel: "Fuel", dirtyair: "Dirty Air",
  teammates: "Teammates", pitstops: "Pit Stops", weather: "Weather",
};

function parsePathParams(pathname: string): { year?: string; mk?: string; sk?: string; dn?: string; subTab?: string; view?: string } {
  // Routes: /:year/:mk/:sk/analysis/:subTab  or  /:year/:mk/:sk/driver/:dn/:tab
  // Skip non-app paths (API, og-image, etc.)
  if (pathname.startsWith("/api/") || pathname.startsWith("/og-image")) return {};
  const segs = pathname.split("/").filter(Boolean);
  // First segment must be a numeric year
  if (segs.length < 1 || !/^\d{4}$/.test(segs[0])) return {};
  const p: { year?: string; mk?: string; sk?: string; dn?: string; subTab?: string; view?: string } = {};
  p.year = segs[0];
  if (segs.length >= 2) p.mk = segs[1];
  if (segs.length >= 3) p.sk = segs[2];
  if (segs.length >= 4 && segs[3] === "analysis") { p.view = "analysis"; if (segs[4]) p.subTab = segs[4]; }
  if (segs.length >= 4 && segs[3] === "driver") { p.view = "driver"; if (segs[4]) p.dn = segs[4]; }
  return p;
}

// Builds Schema.org JSON-LD for a race or session page.
// Returned as an object so the caller can JSON.stringify it once.
function buildSportsEventJsonLd(opts: {
  meeting: any;
  session: any | null;
  driver: any | null;
  url: string;
  ogImage: string;
}): Record<string, any> {
  const { meeting, session, driver, url, ogImage } = opts;
  const year = meeting.year || new Date(meeting.date_start || Date.now()).getFullYear();
  const raceName = meeting.meeting_name || `${meeting.location} Grand Prix`;
  const fullName = session?.session_name
    ? `${year} ${raceName} — ${session.session_name}`
    : `${year} ${raceName}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: fullName,
    sport: "Formula 1",
    url,
    image: ogImage,
    description: driver
      ? `${driver.full_name || driver.name_acronym} telemetry and lap analysis from the ${year} ${raceName}.`
      : `Formula 1 telemetry and race analysis for the ${year} ${raceName}.`,
  };

  if (session?.date_start) jsonLd.startDate = session.date_start;
  else if (meeting.date_start) jsonLd.startDate = meeting.date_start;
  if (session?.date_end) jsonLd.endDate = session.date_end;

  if (meeting.location || meeting.country_name) {
    jsonLd.location = {
      "@type": "Place",
      name: meeting.circuit_short_name || meeting.location || raceName,
      address: {
        "@type": "PostalAddress",
        addressLocality: meeting.location || undefined,
        addressCountry: meeting.country_name || meeting.country_code || undefined,
      },
    };
  }

  jsonLd.organizer = {
    "@type": "Organization",
    name: "Formula 1",
    url: "https://www.formula1.com",
  };

  if (driver) {
    jsonLd.competitor = [{
      "@type": "Person",
      name: driver.full_name || driver.name_acronym,
      affiliation: driver.team_name ? { "@type": "SportsTeam", name: driver.team_name } : undefined,
    }];
  }

  return jsonLd;
}

function buildBreadcrumbJsonLd(parts: { name: string; url: string }[]): Record<string, any> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: parts.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      item: p.url,
    })),
  };
}

// Inject one or more <script type="application/ld+json"> blocks before </head>.
// JSON.stringify is safe here — we control the keys, and values are plain strings/numbers.
// We still escape `</script` to defend against any future user-derived value sneaking in.
function injectJsonLd(html: string, blocks: Record<string, any>[]): string {
  if (!blocks.length) return html;
  const scripts = blocks.map(b => {
    const json = JSON.stringify(b).replace(/<\/script/gi, "<\\/script");
    return `<script type="application/ld+json">${json}</script>`;
  }).join("\n    ");
  return html.replace(/<\/head>/i, `    ${scripts}\n  </head>`);
}

async function buildOgTags(url: URL, r2?: R2Bucket): Promise<{ title: string; description: string; ogUrl: string; jsonLd: Record<string, any>[] } | null> {
  // Support both new path-based URLs and legacy query-param URLs
  let mk: string | null, sk: string | null, dn: string | null, view: string | null, subTab: string | null;
  const pathParams = parsePathParams(url.pathname);
  if (pathParams.mk) {
    mk = pathParams.mk;
    sk = pathParams.sk || null;
    dn = pathParams.dn || null;
    view = pathParams.view || null;
    subTab = pathParams.subTab || null;
  } else {
    const sp = url.searchParams;
    mk = sp.get("mk");
    sk = sp.get("sk");
    dn = sp.get("dn");
    view = sp.get("view");
    subTab = sp.get("subTab");
  }

  if (!mk) return null;

  // Fetch all metadata in parallel — none depend on each other
  const [meetings, drivers, sessions] = await Promise.all([
    fetchCached("/meetings?meeting_key=" + mk, r2),
    dn && sk ? fetchCached("/drivers?session_key=" + sk + "&driver_number=" + dn, r2) : null,
    sk ? fetchCached("/sessions?session_key=" + sk, r2) : null,
  ]);

  const meeting = meetings?.[0];
  if (!meeting) return null;

  const raceName = meeting.meeting_name || "Grand Prix";
  const year = meeting.year || new Date().getFullYear();
  const parts: string[] = [];

  const driver = drivers?.[0];
  if (driver) parts.push(driver.full_name || driver.name_acronym);

  const session = sessions?.[0];
  if (session?.session_name) parts.push(session.session_name);

  // Add analysis sub-tab
  if (view === "analysis" && subTab && SUB_TAB_LABELS[subTab]) {
    parts.push(SUB_TAB_LABELS[subTab]);
  }

  parts.push(`${year} ${raceName}`);

  const title = parts.join(" — ") + " | OpenF1ow";
  const description = `F1 telemetry and race analysis for the ${year} ${raceName}. Lap times, sector splits, tire strategies, and more on OpenF1ow.`;
  const ogUrl = url.origin + url.pathname + url.search;

  // Build the og:image URL the same way injectOgTags does, so JSON-LD `image` matches.
  const imgUrl = new URL(ogUrl);
  imgUrl.pathname = "/og-image";
  const ogImage = imgUrl.toString();

  const jsonLd: Record<string, any>[] = [
    buildSportsEventJsonLd({ meeting, session, driver, url: ogUrl, ogImage }),
  ];

  // Breadcrumbs help Google build rich navigation snippets.
  const crumbs: { name: string; url: string }[] = [
    { name: "OpenF1ow", url: url.origin + "/" },
    { name: String(year), url: `${url.origin}/${year}` },
    { name: raceName, url: `${url.origin}/${year}/${mk}` },
  ];
  if (sk && session) {
    const sessLabel = session.session_name || "Session";
    crumbs.push({ name: sessLabel, url: `${url.origin}/${year}/${mk}/${sk}/analysis/overview` });
  }
  if (driver) {
    crumbs.push({ name: driver.full_name || driver.name_acronym, url: ogUrl });
  }
  if (crumbs.length > 1) jsonLd.push(buildBreadcrumbJsonLd(crumbs));

  return { title, description, ogUrl, jsonLd };
}

// Escape for safe injection into HTML attribute values
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectOgTags(html: string, og: { title: string; description: string; ogUrl: string }): string {
  const title = escAttr(og.title);
  const desc = escAttr(og.description);
  const ogUrl = escAttr(og.ogUrl);

  // Build og:image URL robustly
  const imgUrl = new URL(og.ogUrl);
  imgUrl.pathname = "/og-image";
  const ogImageUrl = escAttr(imgUrl.toString());

  let result = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${desc}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${ogUrl}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${ogUrl}"`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${title}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${desc}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${title}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${desc}"`);

  if (!result.includes('og:image')) {
    result = result.replace(
      '<meta property="og:site_name"',
      `<meta property="og:image" content="${ogImageUrl}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta property="og:site_name"`,
    );
  }

  if (!result.includes('twitter:image" content="http')) {
    result = result.replace(
      '<meta name="twitter:description"',
      `<meta name="twitter:image" content="${ogImageUrl}" />\n    <meta name="twitter:description"`,
    );
  }

  return result;
}

// ============================================================================
// OG IMAGE GENERATION
// ============================================================================

function generateOgImageSvg(title: string, subtitle: string): string {
  const W = 1200, H = 630;
  // Escape XML entities
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050508"/>
      <stop offset="100%" stop-color="#0a0e14"/>
    </linearGradient>
    <linearGradient id="red" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e10600"/>
      <stop offset="100%" stop-color="#b80500"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- Red accent line -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#red)"/>
  <!-- Logo -->
  <text x="60" y="100" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="800">
    <tspan fill="rgba(255,255,255,0.5)">Open</tspan><tspan fill="rgba(225,6,0,0.8)">F1</tspan><tspan fill="rgba(255,255,255,0.5)">ow</tspan>
  </text>
  <!-- Title -->
  <text x="60" y="${H/2 - 10}" font-family="Inter,system-ui,sans-serif" font-size="48" font-weight="800" fill="#e8e8ec">${esc(title)}</text>
  <!-- Subtitle -->
  <text x="60" y="${H/2 + 50}" font-family="Inter,system-ui,sans-serif" font-size="24" font-weight="500" fill="rgba(255,255,255,0.4)">${esc(subtitle)}</text>
  <!-- URL -->
  <text x="60" y="${H - 40}" font-family="monospace" font-size="16" fill="rgba(255,255,255,0.15)">openf1ow.com</text>
  <!-- Bottom red line -->
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#red)"/>
</svg>`;
}

// ============================================================================
// GROQ AI ANALYSIS
// ============================================================================

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are an expert Formula 1 race analyst and strategist — think Martin Brundle meets a data scientist. You produce broadcast-quality race summaries from telemetry-derived data.

## F1 Domain Knowledge
- Tire compounds: SOFT (fastest, ~0.7s/lap advantage, high degradation), MEDIUM (balanced), HARD (slowest, most durable), INTERMEDIATE (light rain), WET (heavy rain)
- Fuel effect: Cars start with ~110kg fuel. Each kg costs ~0.055s/lap. Cars get faster as fuel burns off.
- "Deg/Lap" values are fuel-corrected — they show TRUE tire wear with fuel effect removed. Values above 0.08 s/lap = high degradation.
- DRS (Drag Reduction System): Available when within 1 second of the car ahead in designated zones. Gives ~0.3s/lap advantage.
- Dirty air: Following within ~1.5s causes aerodynamic loss, hurting cornering performance. This is why overtaking is difficult.
- Undercut: Pitting before a rival to gain track position via fresh-tire pace advantage on the out-lap.
- Overcut: Staying out longer on old tires, hoping the rival's out-lap in traffic is slow.
- Safety Car: Bunches up the field, erasing gaps. Strategic pit stops under SC are nearly "free."
- Gap values: Positive = slower than leader. A gap of 0.3s in median pace is significant over a race distance.

## Data You Will Receive
You will receive a JSON object with data from ALL analysis tabs (except weather). Cross-reference every section to build a complete picture:
- **results**: Final race classification — positions, gaps, DNFs/retirements. START HERE to anchor your narrative.
- **paceRanking**: Each driver's median race pace on clean laps, gap to leader, best lap. This reveals who was genuinely fast vs. who just finished well.
- **constructorPace**: Team-level pace — which car was fastest? Compare both drivers within each team.
- **tireDegradation**: Per-stint degradation rates by compound. Who destroyed their tires? Who made them last? Look at compound choices and stint lengths.
- **teammateGaps**: Head-to-head within each team on comparable laps. The gap reveals driver quality since the car is identical.
- **pitStops**: Pit crew efficiency — average and best stop times per team. Did a slow stop cost anyone a position?
- **dirtyAir**: Who spent the most time stuck in traffic? How much time did they lose per lap in dirty air? This explains why some fast drivers finished lower.
- **raceControl**: Safety cars, flags, penalties, investigations, retirements — the key incidents that shaped the race.

## Output Structure
Produce these sections with markdown headers:

1. **Race Summary** — 3-4 sentences. Who won, the margin of victory, headline story. Mention any DNFs, safety cars, or dramatic incidents from raceControl. Set the scene.

2. **Winner & Podium** — Analyze the top 3 finishers. For each: their pace ranking vs. finishing position, strategy, tire management. Did they win on pure pace or strategy? Reference specific data.

3. **Exceptional Drives** — Highlight 2-3 drivers who overperformed relative to their car's pace. Look for: large gap between constructorPace ranking and finishing position (e.g. car ranked P6 but finished P4), strong teammate battles won against the odds, excellent tire management (low deg), clean air mastery. Also mention any remarkable recovery drives.

4. **Key Battles & Moments** — The most interesting intra-team fights (use teammateGaps), wheel-to-wheel battles (use dirtyAir for who was stuck behind whom), and pivotal strategy calls. Reference penalties or incidents from raceControl that changed outcomes.

5. **Pit Stop & Strategy Analysis** — Which teams nailed strategy? Compare stint lengths and compound choices. Highlight the fastest and slowest pit crews. Did anyone clearly gain or lose positions through pit stop timing?

6. **Who Left Performance on the Table?** — 2-3 drivers or teams who underperformed. Look for: fast pace but poor result (high paceRanking but low finishing position), high tire degradation, slow pit stops, too much time in dirty air, or penalties.

## Rules
- Cross-reference ALL data sections — don't analyze each in isolation
- ALWAYS cite specific numbers: lap times, gaps, deg rates, pit durations, dirty air time loss
- Compare pace ranking to actual finishing position — the delta tells the story
- Name specific drivers and teams in every point — no generic statements
- Keep it ~600-800 words total
- Format lap times as M:SS.sss when referencing specific times
- If a data section is empty or has limited entries, skip that angle rather than speculating
- Write with personality — this should read like expert TV commentary, not a spreadsheet summary`;

// Shrink the summary before sending to the LLM — Groq free tier has a 12k TPM
// cap on 70B. Full-grid sector/speed/dirty-air breakdowns are ~23k tokens;
// we cap the long-tail sections to the interesting entries and drop
// over-precise decimals, keeping ~90% of the analytical signal.
function compactSummary(s: any): any {
  if (!s || typeof s !== "object") return s;
  const round3 = (x: unknown) => typeof x === "number" ? +x.toFixed(3) : x;
  const mapRound = <T extends Record<string, unknown>>(o: T): T => {
    const out: Record<string, unknown> = {};
    for (const k in o) out[k] = typeof o[k] === "number" ? round3(o[k]) : o[k];
    return out as T;
  };

  const cap = <T>(arr: T[] | undefined, n: number): T[] | undefined =>
    Array.isArray(arr) ? arr.slice(0, n) : arr;

  return {
    ...s,
    tireDegradation: Array.isArray(s.tireDegradation) ? s.tireDegradation.map(mapRound) : s.tireDegradation,
    dirtyAir: cap(Array.isArray(s.dirtyAir) ? s.dirtyAir.map(mapRound) : s.dirtyAir, 12),
    sectorAnalysis: s.sectorAnalysis
      ? { ...s.sectorAnalysis, drivers: cap(s.sectorAnalysis.drivers, 10) }
      : s.sectorAnalysis,
    topSpeeds: cap(Array.isArray(s.topSpeeds) ? s.topSpeeds.map(mapRound) : s.topSpeeds, 10),
  };
}

function buildPrompt(payload: any): string {
  const meta = payload?.raceMeta;
  const header = meta
    ? `Race: ${meta.year ?? ""} ${meta.meetingName ?? ""}${meta.country ? " (" + meta.country + ")" : ""}${meta.sessionName ? " — " + meta.sessionName : ""}`.trim()
    : "";
  const body = { ...payload };
  delete body.raceMeta;
  return `Analyze this Formula 1 race using the data below. The data has been pre-computed from telemetry — trust the numbers.${header ? "\n\n" + header : ""}\n\n${JSON.stringify(compactSummary(body))}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // OG image endpoint — returns SVG with race/driver branding
    if (url.pathname === "/og-image" && request.method === "GET") {
      const og = await buildOgTags(url, env.F1_DATA);
      if (!og) {
        return new Response("Missing params", { status: 400 });
      }
      // Split title into main + context
      const titleParts = og.title.replace(" | OpenF1ow", "").split(" — ");
      const mainTitle = titleParts[0] || "OpenF1ow";
      const subtitle = titleParts.slice(1).join(" — ");
      const svg = generateOgImageSvg(mainTitle, subtitle);
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // OpenF1 API proxy — serve from R2 cache (must be before OG/SPA handlers)
    if (url.pathname.startsWith("/api/f1/")) {
      return handleF1Request(request, env, ctx);
    }

    // Season trends artifact — precomputed by scripts/compute-season-trends.mjs
    if (url.pathname.startsWith("/api/season-trends/")) {
      const r = await handleSeasonTrendsRequest({ url, F1_DATA: env.F1_DATA });
      if (r) return r;
    }

    // Worker-rendered SEO pages: /recap/:year/:slug and /insights[/:year]
    if (url.pathname.startsWith("/recap/") && env.ASSETS) {
      const r = await handleRecapRequest({ url, ASSETS: env.ASSETS, F1_DATA: env.F1_DATA, gaId: env.GA_ID });
      if (r) return r;
    }
    if ((url.pathname === "/insights" || url.pathname.startsWith("/insights/")) && env.ASSETS) {
      const r = await handleInsightsRequest({ url, ASSETS: env.ASSETS, gaId: env.GA_ID });
      if (r) return r;
    }
    // Static methodology / about page — Worker-rendered for SEO.
    if (url.pathname === "/about" || url.pathname === "/about/") {
      const r = handleAboutRequest({ url });
      if (r) return r;
    }

    // Slug-URL → numeric-URL 301 redirects. Catches /:year/:slug/...
    // patterns (must run before the SPA fallback for /2* paths).
    if (env.ASSETS && /^\/\d{4}\//.test(url.pathname)) {
      const r = await handleSlugRedirect({ url, ASSETS: env.ASSETS });
      if (r) return r;
    }
    // PNG share cards for race recaps (Twitter/Slack/Discord preview)
    if (url.pathname.startsWith("/share/race/") && env.ASSETS) {
      const r = await handleShareRaceRequest({ url, ASSETS: env.ASSETS, F1_DATA: env.F1_DATA });
      if (r) return r;
    }
    if (url.pathname.startsWith("/share/driver/") && env.ASSETS) {
      const r = await handleShareDriverRequest({ url, ASSETS: env.ASSETS, F1_DATA: env.F1_DATA });
      if (r) return r;
    }
    // User-uploaded chart screenshots: read by hash, upload via POST.
    if (url.pathname.startsWith("/share/img/")) {
      const r = await handleShareImageRead({ url, F1_DATA: env.F1_DATA });
      if (r) return r;
    }
    if (url.pathname === "/api/share/upload") {
      return handleShareImageUpload({ request, F1_DATA: env.F1_DATA });
    }

    // Helper: fetch index.html from assets
    async function fetchIndexHtml(): Promise<Response | null> {
      if (!env.ASSETS) return null; // ASSETS binding not available in dev
      for (const path of ["/", "/index.html"]) {
        try {
          const res = await env.ASSETS.fetch(new Request(url.origin + path));
          if (res.ok) return res;
        } catch { /* try next */ }
      }
      return null;
    }

    // Serve dynamic OG tags for page navigation requests (path-based or legacy query params)
    const ogParams = parsePathParams(url.pathname);
    if (request.method === "GET" && (ogParams.mk || (url.pathname === "/" && url.searchParams.has("mk")))) {
      try {
        const assetRes = env.ASSETS ? await fetchIndexHtml() : null;
        if (assetRes) {
          let html = await assetRes.text();
          const og = await buildOgTags(url, env.F1_DATA);
          if (og) {
            html = injectOgTags(html, og);
            html = injectJsonLd(html, og.jsonLd);
          }
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        // Dev mode fallback: proxy to root for SPA
        if (!env.ASSETS) {
          return await fetch(new Request(url.origin + "/"));
        }
      } catch {
        // Fall through to asset serving on error
      }
    }

    if (url.pathname !== "/api/analyze") {
      // Delegate non-Worker routes (static assets + SPA fallback) to ASSETS.
      // The asset binding's `not_found_handling: single-page-application` will
      // serve index.html for any unmatched path.
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      // Dev fallback when ASSETS isn't bound (e.g. plain `wrangler dev` without
      // build): proxy index.html from the Vite dev server.
      try {
        return await fetch(new Request(url.origin + "/"));
      } catch { /* fall through */ }
      return new Response(null, { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (!env.GROQ_API_KEY) {
      return new Response("GROQ_API_KEY not configured", { status: 500, headers: CORS_HEADERS });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
    }

    const groqBody = {
      model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(body) },
      ],
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    };

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(groqBody),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return new Response(`Groq API error: ${groqRes.status} ${err}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    // Stream the Groq SSE response back to the client, normalizing OpenAI-style
    // chunks into the { text } shape AIAnalysis.tsx already parses.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const processLine = async (line: string) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.choices?.[0]?.delta?.content;
        if (text) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      } catch {
        // skip unparseable chunks
      }
    };

    (async () => {
      try {
        if (!groqRes.body) throw new Error("No response body from Groq");
        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            await processLine(line);
          }
        }

        // Process remaining buffer
        await processLine(buffer);
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        try { await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`)); } catch {}
      } finally {
        try { await writer.close(); } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  },
};
