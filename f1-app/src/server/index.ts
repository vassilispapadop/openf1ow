import { handleF1Request, normalizeKey } from "./r2-cache";
import { handleAdminRequest } from "./admin";
import { runScheduledTick } from "./cron";
import { handleBundleRequest } from "./bundle";
import { handleSessionInsightsRequest } from "./insights";
import { handleRecapRequest, handleInsightsRequest, buildRaceContentBlock } from "./recap";
import { handleShareRaceRequest, handleShareDriverRequest } from "./share-card";
import { handleShareImageUpload, handleShareImageRead } from "./share-image";
import { handleSeasonTrendsRequest } from "./season-trends";
import { handleAboutRequest } from "./about";
import { handleSlugRedirect } from "./slug-redirect";

interface Env {
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  // Bearer secret for /api/admin/* (purge / refresh a session's cache).
  ADMIN_TOKEN?: string;
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
  // Try R2 first (data may already be cached by the /api/f1 proxy). The proxy
  // writes keys with query params sorted, so build the lookup the same way —
  // "drivers?session_key=…&driver_number=…" never matched before this.
  if (r2) {
    try {
      const key = normalizeKey(path);
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
  replay: "Race Replay", pace: "Race Pace",
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
  const driverInfo = driver ? ` — ${driver.full_name || driver.name_acronym}` : "";
  const sessionInfo = session?.session_name ? ` | ${session.session_name}` : "";
  const description = `Deep F1 telemetry analysis: ${driverInfo}${sessionInfo} — lap-by-lap timing, speed traces, sector splits, tire degradation, pit strategies and engine-computed race analysis for the ${year} ${raceName}.`;
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
// RACE SITEMAP — generate per-race URLs for Google Search Console
// ============================================================================

async function generateRaceSitemap(
  env: Env,
): Promise<Response | null> {
  try {
    const [meetingsRes] = await Promise.all([
      fetchCached("/meetings", env.F1_DATA),
    ]);
    const meetings = Array.isArray(meetingsRes) ? meetingsRes : [];
    if (!meetings.length) return null;

    const urls = new Set<string>();
    const now = new Date();
    for (const m of meetings) {
      const year = m.year;
      const mk = m.meeting_key;
      if (!year || !mk) continue;

      urls.add(`<url><loc>https://www.openf1ow.com/${year}</loc><lastmod>${now.toISOString().split("T")[0]}</lastmod><priority>0.7</priority></url>`);
      urls.add(`<url><loc>https://www.openf1ow.com/${year}/${mk}</loc><lastmod>${m.date_start ? new Date(m.date_start).toISOString().split("T")[0] : now.toISOString().split("T")[0]}</lastmod><priority>0.9</priority></url>`);

      for (const s of meetings) {
        if (s.meeting_key === mk) {
          const sk = s.session_key;
          if (sk) {
            urls.add(`<url><loc>https://www.openf1ow.com/${year}/${mk}/${sk}/analysis/overview</loc><lastmod>${s.date_start ? new Date(s.date_start).toISOString().split("T")[0] : now.toISOString().split("T")[0]}</lastmod><priority>0.8</priority></url>`);
          }
        }
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${Array.from(urls).join("\n  ")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("sitemap error:", e);
    return null;
  }
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
// BOT PROBE FILTER — paths that only vulnerability scanners request
// ============================================================================

// Paths that only vulnerability scanners request — this is a static React app
// on Cloudflare, so any .php, WordPress path, or exposed-dotfile probe is junk.
const BOT_PROBE_RE =
  /\.(php($|[?/])|\/wp-(admin|includes|content|login)|xmlrpc|\/\.(env|git|aws|ssh)|\/vendor\/|\/phpmyadmin)/i;

export default {
  // Cron Trigger (wrangler.jsonc): one settled session per tick — warm its
  // endpoints, derive the intervals window, store the engine's insights.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const report = await runScheduledTick(env, ctx);
    console.log("cron", JSON.stringify(report));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Drop automated vulnerability-scanner probes early — the app has no PHP,
    // WordPress, or dotfiles, so these are always malicious noise (they inflate
    // request counts and hit the SPA fallback). Blocking here short-circuits
    // before any R2/upstream work. A zone WAF rule would block at the edge
    // (cheaper still); this is the in-Worker equivalent when WAF isn't wired up.
    if (BOT_PROBE_RE.test(url.pathname)) {
      return new Response("Not found", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null);
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

    // Sitemap endpoint — static XML index
    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      const staticIdx = env.ASSETS ? await env.ASSETS.fetch(new Request(url.origin + "/sitemap-index.xml")) : null;
      if (staticIdx?.ok) return staticIdx;
      return new Response(null, { status: 404 });
    }

    // Sitemap — dynamic race pages list (generated on each request)
    if (url.pathname === "/sitemap-races.xml" && request.method === "GET") {
      const raceSitemap = await generateRaceSitemap(env);
      if (raceSitemap) return raceSitemap;
      return new Response(null, { status: 404 });
    }

    // OpenF1 API proxy — serve from R2 cache (must be before OG/SPA handlers)
    if (url.pathname.startsWith("/api/f1/")) {
      return handleF1Request(request, env, ctx);
    }
    // Everything the analytics engine needs for one session, in one response.
    if (url.pathname.startsWith("/api/session/")) {
      const r = (await handleBundleRequest(request, env, ctx)) ?? (await handleSessionInsightsRequest(request, env, ctx));
      if (r) return r;
    }
    // Operator endpoints (bearer secret; 404 when unauthorised).
    if (url.pathname.startsWith("/api/admin/")) {
      const r = await handleAdminRequest(request, env, ctx);
      if (r) return r;
    }

    // Season trends artifact — precomputed by scripts/compute-season-trends.mjs
    if (url.pathname.startsWith("/api/season-trends/")) {
      const r = await handleSeasonTrendsRequest({ url, F1_DATA: env.F1_DATA });
      if (r) return r;
    }

    // Worker-rendered SEO pages: /recap/:year/:slug and /insights[/:year]
    if (url.pathname.startsWith("/recap/") && env.ASSETS) {
      const r = await handleRecapRequest({ url, ASSETS: env.ASSETS, F1_DATA: env.F1_DATA, gaId: env.GA_ID, ctx });
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
      const r = await handleShareRaceRequest({ url, ASSETS: env.ASSETS, F1_DATA: env.F1_DATA, ctx });
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
          // Inject crawlable race content (winner, podium, internal links) into
          // the otherwise-empty SPA shell. Best-effort — never block the page.
          if (ogParams.mk && ogParams.year) {
            try {
              const block = await buildRaceContentBlock({
                ASSETS: env.ASSETS,
                F1_DATA: env.F1_DATA,
                origin: url.origin,
                year: ogParams.year,
                meetingKey: Number(ogParams.mk),
              });
              if (block) {
                html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${block}</div>`);
              }
            } catch { /* fall back to the plain shell */ }
          }
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              // MUST NOT be edge-cached: this shell embeds fingerprinted asset
              // URLs (index-<hash>.js). A cached copy outlives the next deploy
              // and then points at 404'd bundles, leaving only the injected
              // static block ("Loading interactive telemetry…" that never
              // resolves). Revalidate every time; the Worker re-injects cheaply.
              "Cache-Control": "no-cache, must-revalidate",
            },
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

    // Delegate routes (static assets + SPA fallback) to ASSETS.
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
  },
};
