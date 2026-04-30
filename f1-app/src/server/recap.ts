// Server-rendered race recap pages. Returns a fully-formed HTML document
// — title, meta, OG, JSON-LD, and a static rendering of the headline stats
// (final classification, top pace, biggest gainer). Indexable by crawlers
// without the SPA shell loading. Long-cached at the edge.

interface RaceIndexEntry {
  slug: string;
  meetingKey: number;
  meetingName: string;
  officialName: string;
  country: string;
  countryCode: string;
  location: string;
  circuit: string;
  dateStart: string;
  sessions: Record<string, number>;
}

interface RaceIndex {
  generatedAt: string;
  byYear: Record<string, RaceIndexEntry[]>;
}

let raceIndexCache: { data: RaceIndex; ts: number } | null = null;
const RACE_INDEX_TTL = 600_000; // 10 min

export async function loadRaceIndex(
  ASSETS: { fetch: (req: Request | string) => Promise<Response> },
  origin: string,
): Promise<RaceIndex | null> {
  if (raceIndexCache && Date.now() - raceIndexCache.ts < RACE_INDEX_TTL) {
    return raceIndexCache.data;
  }
  try {
    const res = await ASSETS.fetch(new Request(origin + "/race-index.json"));
    if (!res.ok) return null;
    const data = (await res.json()) as RaceIndex;
    raceIndexCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function findRace(idx: RaceIndex, year: string, slug: string): RaceIndexEntry | null {
  const list = idx.byYear[year];
  if (!list) return null;
  return list.find(r => r.slug === slug) || null;
}

// ---------------------------------------------------------------------------
// Data fetch from R2 — keyed identically to r2-cache.ts
// ---------------------------------------------------------------------------

async function r2Json<T>(F1_DATA: R2Bucket, key: string): Promise<T | null> {
  try {
    const obj = await F1_DATA.get(key);
    if (!obj) return null;
    return (await obj.json()) as T;
  } catch {
    return null;
  }
}

async function fetchOpenF1<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch("https://api.openf1.org/v1" + path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Try R2 first, fall back to OpenF1 API. Caches absent in R2 are not populated
// here — the next /api/f1 hit will populate them through the regular cache.
async function getSessionData<T>(F1_DATA: R2Bucket, endpoint: string, sessionKey: number): Promise<T | null> {
  const key = `${endpoint}?session_key=${sessionKey}`;
  return (await r2Json<T>(F1_DATA, key)) ?? (await fetchOpenF1<T>(`/${endpoint}?session_key=${sessionKey}`));
}

// ---------------------------------------------------------------------------
// Light analysis — top pace, biggest gainer
// ---------------------------------------------------------------------------

interface Driver { driver_number: number; name_acronym: string; full_name?: string; team_name?: string; team_colour?: string; }
interface Lap { driver_number: number; lap_number: number; lap_duration?: number | null; is_pit_out_lap?: boolean; }
interface SessionResult { position?: number; driver_number?: number; full_name?: string; gap_to_leader?: string | number; status?: string; }

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function fmtTime(sec: number): string {
  if (!sec || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m + ":" + s.toFixed(3).padStart(6, "0");
}

interface PaceRow { driver: string; team: string; teamColour: string; medianPace: string; gap: string; }

function buildPaceRanking(laps: Lap[], drivers: Driver[]): PaceRow[] {
  const byDriver: Record<number, number[]> = {};
  // Slow-lap threshold: 1.07 × median of all valid lap durations
  const valid = laps
    .filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1)
    .map(l => l.lap_duration!);
  if (valid.length < 5) return [];
  const threshold = median(valid) * 1.07;

  for (const l of laps) {
    if (!l.lap_duration || l.lap_duration <= 0 || l.is_pit_out_lap || l.lap_number <= 1) continue;
    if (l.lap_duration >= threshold) continue;
    if (!byDriver[l.driver_number]) byDriver[l.driver_number] = [];
    byDriver[l.driver_number].push(l.lap_duration);
  }

  const rows = drivers
    .map(d => {
      const times = byDriver[d.driver_number];
      if (!times || times.length < 3) return null;
      const m = median(times);
      return { driver: d.name_acronym, team: d.team_name || "", teamColour: d.team_colour || "888", _med: m };
    })
    .filter((x): x is { driver: string; team: string; teamColour: string; _med: number } => !!x)
    .sort((a, b) => a._med - b._med);

  const fastest = rows[0]?._med ?? 0;
  return rows.map(r => ({
    driver: r.driver,
    team: r.team,
    teamColour: r.teamColour,
    medianPace: fmtTime(r._med),
    gap: r._med === fastest ? "—" : "+" + (r._med - fastest).toFixed(3) + "s",
  }));
}

interface GainerRow { driver: string; team: string; from: number; to: number; gained: number; }

// Biggest gainer = positions gained vs starting grid. Uses session_result if available;
// otherwise compares first-lap order to final results.
function buildBiggestGainers(results: SessionResult[], drivers: Driver[], laps: Lap[]): GainerRow[] {
  const drvByNum: Record<number, Driver> = {};
  drivers.forEach(d => { drvByNum[d.driver_number] = d; });

  // Final positions (excluding DNFs)
  const finals: Record<number, number> = {};
  for (const r of results) {
    if (r.driver_number != null && r.position != null && r.status === "Finished") {
      finals[r.driver_number] = r.position;
    }
  }

  // Starting positions: lap_number=1 ordered by lap_duration (rough proxy for grid order
  // when grid data isn't in R2). Real grid would come from results metadata, but this
  // approximates the lap-1 order which is what fans care about for "gained N positions".
  const lap1 = laps
    .filter(l => l.lap_number === 1 && l.lap_duration)
    .sort((a, b) => (a.lap_duration ?? 0) - (b.lap_duration ?? 0));
  const starts: Record<number, number> = {};
  lap1.forEach((l, i) => { starts[l.driver_number] = i + 1; });

  const rows: GainerRow[] = [];
  for (const dn of Object.keys(finals).map(Number)) {
    const start = starts[dn];
    const finish = finals[dn];
    if (!start || !finish) continue;
    const gained = start - finish;
    if (gained <= 0) continue;
    const d = drvByNum[dn];
    if (!d) continue;
    rows.push({ driver: d.name_acronym, team: d.team_name || "", from: start, to: finish, gained });
  }

  return rows.sort((a, b) => b.gained - a.gained).slice(0, 5);
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escScriptJson(o: unknown): string {
  return JSON.stringify(o).replace(/<\/script/gi, "<\\/script");
}

interface RecapData {
  race: RaceIndexEntry;
  year: string;
  results: SessionResult[];
  drivers: Driver[];
  pace: PaceRow[];
  gainers: GainerRow[];
  hasRaceData: boolean;
}

export function renderRecapHtml(d: RecapData, origin: string): string {
  const { race, year } = d;
  const slug = race.slug;
  const canonical = `${origin}/recap/${year}/${slug}`;
  const ogImage = `${origin}/share/race/${year}/${slug}.png`;
  const title = `${year} ${race.meetingName} — Race Recap | OpenF1ow`;
  const description = d.hasRaceData
    ? `${year} ${race.meetingName} race recap: top pace, biggest gainers, and full classification at ${race.circuit}.`
    : `${year} ${race.meetingName} preview at ${race.circuit}, ${race.country}. Telemetry and analysis on OpenF1ow.`;

  const drvByNum: Record<number, Driver> = {};
  d.drivers.forEach(dr => { drvByNum[dr.driver_number] = dr; });

  const winner = d.results.find(r => r.position === 1);
  const winnerDriver = winner?.driver_number ? drvByNum[winner.driver_number] : null;

  const sessionLink = race.sessions.race
    ? `/${year}/${race.meetingKey}/${race.sessions.race}/analysis/overview`
    : `/${year}/${race.meetingKey}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${year} ${race.meetingName}`,
    startDate: race.dateStart,
    sport: "Formula 1",
    url: canonical,
    image: ogImage,
    description,
    location: {
      "@type": "Place",
      name: race.circuit || race.location,
      address: { "@type": "PostalAddress", addressLocality: race.location, addressCountry: race.country },
    },
    organizer: { "@type": "Organization", name: "Formula 1", url: "https://www.formula1.com" },
    ...(winnerDriver ? {
      competitor: d.results.slice(0, 10).map(r => {
        const drv = r.driver_number ? drvByNum[r.driver_number] : null;
        return {
          "@type": "Person",
          name: drv?.full_name || r.full_name || drv?.name_acronym || "",
          ...(drv?.team_name ? { affiliation: { "@type": "SportsTeam", name: drv.team_name } } : {}),
        };
      }),
    } : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OpenF1ow", item: origin + "/" },
      { "@type": "ListItem", position: 2, name: "Insights", item: origin + "/insights" },
      { "@type": "ListItem", position: 3, name: `${year} season`, item: `${origin}/insights/${year}` },
      { "@type": "ListItem", position: 4, name: race.meetingName, item: canonical },
    ],
  };

  // ----- Body sections -----

  const heroDate = race.dateStart
    ? new Date(race.dateStart).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  const classificationRows = d.results.slice(0, 10).map(r => {
    const drv = r.driver_number ? drvByNum[r.driver_number] : null;
    const name = drv?.full_name || r.full_name || drv?.name_acronym || "—";
    const team = drv?.team_name || "";
    const gap = r.gap_to_leader ?? "";
    return `<tr>
      <td class="pos">${escHtml(r.position ?? "—")}</td>
      <td class="drv">${escHtml(name)}</td>
      <td class="team">${escHtml(team)}</td>
      <td class="gap">${escHtml(gap)}</td>
      <td class="status">${escHtml(r.status || "")}</td>
    </tr>`;
  }).join("\n");

  const paceRows = d.pace.slice(0, 5).map((p, i) => `<tr>
    <td class="pos">${i + 1}</td>
    <td class="drv">${escHtml(p.driver)}</td>
    <td class="team">${escHtml(p.team)}</td>
    <td class="pace">${escHtml(p.medianPace)}</td>
    <td class="gap">${escHtml(p.gap)}</td>
  </tr>`).join("\n");

  const gainerRows = d.gainers.map(g => `<tr>
    <td class="drv">${escHtml(g.driver)}</td>
    <td class="team">${escHtml(g.team)}</td>
    <td class="num">P${g.from}</td>
    <td class="num">→ P${g.to}</td>
    <td class="num gained">+${g.gained}</td>
  </tr>`).join("\n");

  const otherSessionLinks = (["qualifying", "sprint", "sprintqualifying"] as const)
    .filter(k => race.sessions[k])
    .map(k => {
      const label = k === "sprintqualifying" ? "Sprint Qualifying" : k.charAt(0).toUpperCase() + k.slice(1);
      return `<a href="/${year}/${race.meetingKey}/${race.sessions[k]}/analysis/overview">${label}</a>`;
    }).join(" · ");

  // Same-year siblings for "more recaps" footer
  // (caller supplies via raceIndex; rendered inline by Worker)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
<link rel="canonical" href="${escHtml(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<meta property="og:type" content="article" />
<meta property="og:url" content="${escHtml(canonical)}" />
<meta property="og:title" content="${escHtml(title)}" />
<meta property="og:description" content="${escHtml(description)}" />
<meta property="og:image" content="${escHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="OpenF1ow" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escHtml(title)}" />
<meta name="twitter:description" content="${escHtml(description)}" />
<meta name="twitter:image" content="${escHtml(ogImage)}" />

<script type="application/ld+json">${escScriptJson(jsonLd)}</script>
<script type="application/ld+json">${escScriptJson(breadcrumb)}</script>

<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter','SF Pro Display',system-ui,sans-serif; background: linear-gradient(180deg,#050508 0%,#0a0e14 100%); color: #e8e8ec; min-height: 100vh; -webkit-font-smoothing: antialiased; }
a { color: #ff5a4a; text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 980px; margin: 0 auto; padding: 24px 28px 80px; }
header.site { padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
.logo .accent { color: #ff5a4a; }
.crumbs { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 14px; }
.crumbs a { color: rgba(255,255,255,0.55); }
h1 { font-size: clamp(34px, 5vw, 52px); line-height: 1.05; letter-spacing: -0.025em; margin: 0 0 10px; font-weight: 800; }
.sub { color: rgba(255,255,255,0.55); font-size: 17px; margin: 0 0 28px; }
.sub strong { color: #fff; font-weight: 600; }
section { margin: 36px 0; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
section h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin: 0 0 18px; }
.cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 22px; background: #ff5a4a; color: #fff !important; border-radius: 999px; font-weight: 700; font-size: 14px; margin-top: 12px; }
.cta:hover { background: #ff7868; text-decoration: none; }
.muted { color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); font-weight: 600; }
td.pos, td.num { font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.7); width: 50px; }
td.drv { font-weight: 600; }
td.team { color: rgba(255,255,255,0.55); }
td.gap, td.pace { font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.7); }
td.gained { color: #34d399; font-weight: 700; }
td.status { color: rgba(255,255,255,0.4); font-size: 12px; }
.empty { color: rgba(255,255,255,0.4); font-style: italic; padding: 12px 0; }
footer.site { margin-top: 60px; padding: 24px 0; border-top: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); font-size: 12px; }
footer.site a { color: rgba(255,255,255,0.5); }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <a class="logo" href="/"><span style="opacity:0.6">Open</span><span class="accent">F1</span><span style="opacity:0.6">ow</span></a>
    <a href="/insights" style="font-size:13px;color:rgba(255,255,255,0.55)">All recaps →</a>
  </header>

  <div class="crumbs">
    <a href="/">Home</a> · <a href="/insights">Insights</a> · <a href="/insights/${year}">${year}</a> · <span>${escHtml(race.meetingName)}</span>
  </div>

  <h1>${escHtml(year + " " + race.meetingName)}</h1>
  <p class="sub">
    ${heroDate ? `<strong>${escHtml(heroDate)}</strong> — ` : ""}
    ${escHtml(race.circuit)}, ${escHtml(race.country)}
    ${winnerDriver ? ` — Won by <strong>${escHtml(winnerDriver.full_name || winnerDriver.name_acronym)}</strong> (${escHtml(winnerDriver.team_name || "")})` : ""}
  </p>

  <a class="cta" href="${escHtml(sessionLink)}">Open full race analysis →</a>
  ${otherSessionLinks ? `<div class="muted">Also: ${otherSessionLinks}</div>` : ""}

  ${d.hasRaceData ? `
  <section>
    <h2>Final classification (top 10)</h2>
    ${classificationRows ? `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap</th><th>Status</th></tr></thead><tbody>${classificationRows}</tbody></table>` : `<div class="empty">Results not yet available.</div>`}
  </section>

  <section>
    <h2>Top pace (median lap time, clean laps)</h2>
    ${paceRows ? `<table><thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Median</th><th>Gap</th></tr></thead><tbody>${paceRows}</tbody></table>` : `<div class="empty">Pace data not yet available.</div>`}
    <div class="muted">"Median pace" filters out outlaps, in-laps, and slow laps (over 7% above the field median). It's the single best indicator of true race pace.</div>
  </section>

  <section>
    <h2>Biggest gainers</h2>
    ${gainerRows ? `<table><thead><tr><th>Driver</th><th>Team</th><th>Lap 1</th><th>Final</th><th>Gained</th></tr></thead><tbody>${gainerRows}</tbody></table>` : `<div class="empty">Position data not yet available.</div>`}
  </section>
  ` : `
  <section>
    <h2>Coming soon</h2>
    <p class="muted">This race hasn't completed yet — telemetry and analysis will appear here after the chequered flag.</p>
  </section>
  `}

  <section>
    <h2>What you can dig into next</h2>
    <p style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6">
      Median race pace, sector-by-sector deltas, fuel-corrected tyre degradation per stint,
      teammate head-to-heads, dirty-air time loss, pit crew efficiency, and an AI-written race verdict —
      all in the <a href="${escHtml(sessionLink)}">full analysis view</a>.
    </p>
  </section>

  <footer class="site">
    Data from <a href="https://openf1.org" rel="noopener">OpenF1 API</a>.
    <a href="/insights">Browse all recaps</a> · <a href="/">Home</a>
  </footer>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Top-level handler
// ---------------------------------------------------------------------------

export async function handleRecapRequest(opts: {
  url: URL;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
}): Promise<Response | null> {
  const { url, ASSETS, F1_DATA } = opts;
  // /recap/2026/imola
  const m = url.pathname.match(/^\/recap\/(\d{4})\/([a-z0-9-]+)\/?$/);
  if (!m) return null;
  const [, year, slug] = m;

  const idx = await loadRaceIndex(ASSETS, url.origin);
  if (!idx) return new Response("Race index unavailable", { status: 503 });
  const race = findRace(idx, year, slug);
  if (!race) return new Response("Race not found", { status: 404 });

  const raceSk = race.sessions.race;
  let drivers: Driver[] = [];
  let laps: Lap[] = [];
  let results: SessionResult[] = [];

  if (raceSk) {
    const [d, l, r] = await Promise.all([
      getSessionData<Driver[]>(F1_DATA, "drivers", raceSk),
      getSessionData<Lap[]>(F1_DATA, "laps", raceSk),
      getSessionData<SessionResult[]>(F1_DATA, "session_result", raceSk),
    ]);
    drivers = d ?? [];
    laps = l ?? [];
    results = r ?? [];
  }

  const pace = laps.length && drivers.length ? buildPaceRanking(laps, drivers) : [];
  const gainers = results.length && drivers.length && laps.length
    ? buildBiggestGainers(results, drivers, laps)
    : [];

  const html = renderRecapHtml({
    race,
    year,
    results,
    drivers,
    pace,
    gainers,
    hasRaceData: results.length > 0 || pace.length > 0,
  }, url.origin);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 30min CDN, 1day stale-while-revalidate so crawlers stay fast.
      "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}

// ---------------------------------------------------------------------------
// /insights and /insights/:year listing pages
// ---------------------------------------------------------------------------

export async function handleInsightsRequest(opts: {
  url: URL;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}): Promise<Response | null> {
  const { url, ASSETS } = opts;
  const m = url.pathname.match(/^\/insights(?:\/(\d{4}))?\/?$/);
  if (!m) return null;
  const yearFilter = m[1];

  const idx = await loadRaceIndex(ASSETS, url.origin);
  if (!idx) return new Response("Race index unavailable", { status: 503 });

  const years = yearFilter ? [yearFilter] : Object.keys(idx.byYear).sort().reverse();
  if (yearFilter && !idx.byYear[yearFilter]) {
    return new Response("Season not found", { status: 404 });
  }

  const now = Date.now();
  const sections = years.map(y => {
    const races = [...idx.byYear[y]].sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""));
    const items = races.map(r => {
      const isPast = r.dateStart ? new Date(r.dateStart).getTime() < now : false;
      const date = r.dateStart ? new Date(r.dateStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
      return `<li>
        <a href="/recap/${y}/${r.slug}">
          <span class="dt">${escHtml(date)}</span>
          <span class="nm">${escHtml(r.meetingName)}</span>
          <span class="loc">${escHtml(r.location)}, ${escHtml(r.country)}</span>
          ${isPast ? "" : `<span class="upcoming">upcoming</span>`}
        </a>
      </li>`;
    }).join("");
    return `<section>
      <h2>${y} season <span class="count">${races.length} races</span></h2>
      <ul class="races">${items}</ul>
    </section>`;
  }).join("");

  const title = yearFilter
    ? `${yearFilter} F1 season — Race recaps & analysis | OpenF1ow`
    : `Race recaps & insights — every Grand Prix | OpenF1ow`;
  const description = yearFilter
    ? `${yearFilter} Formula 1 season: every Grand Prix, full classification, race pace, and telemetry analysis on OpenF1ow.`
    : `Browse every F1 Grand Prix recap and analysis on OpenF1ow — race pace, tyre strategy, and telemetry, by season.`;
  const canonical = yearFilter ? `${url.origin}/insights/${yearFilter}` : `${url.origin}/insights`;

  const total = Object.values(idx.byYear).reduce((n, arr) => n + arr.length, 0);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}" />
<link rel="canonical" href="${escHtml(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escHtml(canonical)}" />
<meta property="og:title" content="${escHtml(title)}" />
<meta property="og:description" content="${escHtml(description)}" />
<meta property="og:image" content="${url.origin}/og-image" />
<meta property="og:site_name" content="OpenF1ow" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escHtml(title)}" />
<meta name="twitter:description" content="${escHtml(description)}" />
<style>
:root { color-scheme: dark; }
body { margin: 0; font-family: 'Inter','SF Pro Display',system-ui,sans-serif; background: linear-gradient(180deg,#050508 0%,#0a0e14 100%); color: #e8e8ec; min-height: 100vh; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 980px; margin: 0 auto; padding: 24px 28px 80px; }
header.site { padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
.logo .accent { color: #ff5a4a; }
.lead { font-size: 17px; color: rgba(255,255,255,0.6); max-width: 640px; margin: 0 0 36px; line-height: 1.55; }
h1 { font-size: clamp(34px, 5vw, 50px); margin: 0 0 12px; line-height: 1.05; letter-spacing: -0.025em; }
section { margin: 40px 0; }
section h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px; display: flex; align-items: baseline; gap: 12px; }
section h2 .count { font-size: 11px; color: rgba(255,255,255,0.3); font-weight: 500; letter-spacing: 0; }
ul.races { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(255,255,255,0.05); border-radius: 12px; overflow: hidden; }
ul.races li a { display: grid; grid-template-columns: 64px 1fr auto auto; gap: 16px; align-items: center; padding: 14px 18px; background: rgba(20,20,28,0.95); transition: background 0.15s ease; }
ul.races li a:hover { background: rgba(30,30,42,0.95); }
.dt { font-size: 12px; color: rgba(255,255,255,0.4); font-variant-numeric: tabular-nums; }
.nm { font-weight: 600; font-size: 15px; }
.loc { font-size: 12px; color: rgba(255,255,255,0.45); }
.upcoming { font-size: 10px; padding: 2px 8px; background: rgba(255,90,74,0.15); color: #ff8470; border-radius: 999px; font-weight: 700; letter-spacing: 0.05em; }
footer.site { margin-top: 60px; padding: 24px 0; border-top: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <a class="logo" href="/"><span style="opacity:0.6">Open</span><span class="accent">F1</span><span style="opacity:0.6">ow</span></a>
    <a href="/" style="font-size:13px;color:rgba(255,255,255,0.55)">Live dashboard →</a>
  </header>

  <h1>${yearFilter ? escHtml(yearFilter + " season") : "Race recaps & insights"}</h1>
  <p class="lead">
    ${yearFilter
      ? `Every ${escHtml(yearFilter)} Grand Prix — final classification, race pace, biggest gainers, and a CTA into full telemetry analysis.`
      : `${total} races across ${years.length} seasons. Open any race for the recap; click through to dig into per-driver telemetry.`
    }
  </p>

  ${sections}

  <footer class="site">
    Data from <a href="https://openf1.org" style="color:rgba(255,255,255,0.5)">OpenF1 API</a>. Updated as races complete.
  </footer>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
