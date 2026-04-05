interface Env {
  GEMINI_API_KEY: string;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

// ============================================================================
// DYNAMIC OG TAGS
// ============================================================================

const OPENF1_API = "https://api.openf1.org/v1";
const metaCache = new Map<string, { data: any; ts: number }>();
const META_TTL = 3600_000; // 1 hour

async function fetchCached(path: string): Promise<any> {
  const cached = metaCache.get(path);
  if (cached && Date.now() - cached.ts < META_TTL) return cached.data;
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

async function buildOgTags(url: URL): Promise<{ title: string; description: string; ogUrl: string } | null> {
  const sp = url.searchParams;
  const mk = sp.get("mk");
  const sk = sp.get("sk");
  const dn = sp.get("dn");
  const view = sp.get("view");
  const subTab = sp.get("subTab");

  if (!mk) return null;

  // Fetch all metadata in parallel — none depend on each other
  const [meetings, drivers, sessions] = await Promise.all([
    fetchCached("/meetings?meeting_key=" + mk),
    dn && sk ? fetchCached("/drivers?session_key=" + sk + "&driver_number=" + dn) : null,
    sk ? fetchCached("/sessions?session_key=" + sk) : null,
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

  return { title, description, ogUrl };
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
// GEMINI AI ANALYSIS
// ============================================================================

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse";

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

function buildPrompt(summary: unknown): string {
  return `Analyze this Formula 1 race using the data below. The data has been pre-computed from telemetry — trust the numbers.\n\n${JSON.stringify(summary, null, 1)}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // OG image endpoint — returns SVG with race/driver branding
    if (url.pathname === "/og-image" && request.method === "GET") {
      const og = await buildOgTags(url);
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

    // Serve dynamic OG tags for page navigation requests
    if (url.pathname === "/" && request.method === "GET" && url.searchParams.has("mk")) {
      try {
        const assetRes = await env.ASSETS.fetch(new Request(url.origin + "/index.html"));
        let html = await assetRes.text();
        const og = await buildOgTags(url);
        if (og) html = injectOgTags(html, og);
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch {
        // Fall through to asset serving on error
      }
    }

    if (url.pathname !== "/api/analyze") {
      return new Response(null, { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response("GEMINI_API_KEY not configured", { status: 500, headers: CORS_HEADERS });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildPrompt(body) }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    };

    const geminiRes = await fetch(`${GEMINI_URL}&key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return new Response(`Gemini API error: ${geminiRes.status} ${err}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    // Stream the Gemini SSE response back to the client, extracting text chunks
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const processLine = async (line: string) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      } catch {
        // skip unparseable chunks
      }
    };

    (async () => {
      try {
        if (!geminiRes.body) throw new Error("No response body from Gemini");
        const reader = geminiRes.body.getReader();
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
