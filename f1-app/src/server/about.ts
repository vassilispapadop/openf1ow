// Server-rendered /about page. Doubles as a methodology reference for
// crawlers + LLMs and a trust-builder for human visitors.

const ABOUT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>About OpenF1ow — methodology, data sources, open source</title>
<meta name="description" content="OpenF1ow is a free open-source Formula 1 telemetry analysis platform. Methodology: clean-lap median pace, fuel-corrected tyre degradation, dirty-air time loss, and AI-written race verdicts." />
<link rel="canonical" href="https://www.openf1ow.com/about" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.openf1ow.com/about" />
<meta property="og:title" content="About OpenF1ow" />
<meta property="og:description" content="Methodology and data sources behind OpenF1ow's race analysis." />
<meta property="og:site_name" content="OpenF1ow" />
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter','SF Pro Display',system-ui,sans-serif; background: linear-gradient(180deg,#050508 0%,#0a0e14 100%); color: #e8e8ec; min-height: 100vh; -webkit-font-smoothing: antialiased; line-height: 1.6; }
.wrap { max-width: 720px; margin: 0 auto; padding: 32px 24px 80px; }
header.site { padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; text-decoration: none; color: inherit; }
.logo .accent { color: #ff5a4a; }
h1 { font-size: clamp(34px, 5vw, 48px); margin: 0 0 18px; line-height: 1.05; letter-spacing: -0.025em; }
h2 { font-size: 22px; margin: 36px 0 12px; letter-spacing: -0.015em; }
p { color: rgba(255,255,255,0.78); margin: 0 0 14px; font-size: 16px; }
ul { color: rgba(255,255,255,0.78); padding-left: 22px; }
li { margin-bottom: 8px; }
code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono',monospace; font-size: 14px; }
a { color: #ff5a4a; text-decoration: none; }
a:hover { text-decoration: underline; }
.lead { font-size: 17px; color: rgba(255,255,255,0.85); margin-bottom: 28px; }
footer.site { margin-top: 60px; padding: 20px 0; border-top: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); font-size: 13px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <a class="logo" href="/"><span style="opacity:0.6">open</span><span class="accent">f1</span><span style="opacity:0.6">ow</span></a>
    <a href="/insights" style="font-size:13px;color:rgba(255,255,255,0.55);text-decoration:none">All recaps →</a>
  </header>

  <h1>About OpenF1ow</h1>

  <p class="lead">A free, open-source Formula 1 analysis platform. Per-race recaps, season trends, fuel-corrected tyre degradation, dirty-air time loss, and AI-written race verdicts. Built on the <a href="https://openf1.org" rel="noopener">OpenF1 API</a>.</p>

  <h2>What it does</h2>
  <p>OpenF1ow turns raw F1 timing into the kind of analysis that until recently lived only on broadcast booths and team engineering screens. Every Grand Prix from 2023 onward gets:</p>
  <ul>
    <li><strong>A race recap</strong> with classification, top race pace, biggest gainers, prose summary.</li>
    <li><strong>Full session analysis</strong> — race pace ranking, sector deltas, tyre degradation per stint, teammate gaps, dirty-air time loss, pit stop efficiency.</li>
    <li><strong>An AI race verdict</strong> — a Llama 3.3 70B narrative built from the structured data. Not a recap regurgitation; an opinionated read of what actually happened.</li>
    <li><strong>Driver telemetry</strong> with multi-driver comparison, dominance maps, corner-by-corner breakdown.</li>
    <li><strong>Season trends</strong> — constructor pace evolution, teammate gap shifts, tyre-deg by compound across the year.</li>
  </ul>

  <h2>Methodology</h2>
  <p>The core calculations:</p>

  <ul>
    <li><strong>Clean-lap pace</strong>: median lap time after filtering out outlaps, in-laps, and any lap above 1.07× the field median (the slow-lap threshold). This excludes safety-car laps and traffic-affected laps.</li>
    <li><strong>Fuel-corrected tyre degradation</strong>: linear slope of lap times within a stint, with each lap adjusted by <code>(lap_number − 1) × FUEL_CORRECTION</code> where <code>FUEL_CORRECTION = 0.055 s/kg/lap × (start_fuel_kg / total_race_laps)</code>. Sprint races use 40 kg; full Grands Prix use 110 kg. The first two laps of each stint are skipped (tyre warm-up). The result is the true tyre wear rate, not the apparent one — fuel burning off would otherwise mask real degradation.</li>
    <li><strong>Dirty-air time loss</strong>: per-driver median lap time within 1.5 s of the car ahead, vs. clean-air median. Quantifies how much following another car costs in lap time.</li>
    <li><strong>Constructor pace gap</strong>: median of each team's two drivers' median paces, then gap-to-fastest computed across teams. Single-driver outliers don't dominate.</li>
    <li><strong>Driver consistency</strong>: sample standard deviation of clean lap times. Lower = more consistent. Surfaced as the <code>σ</code> column in race pace ranking.</li>
    <li><strong>Cornering analysis</strong>: corner apexes detected as local minima in the speed trace. For each corner: brake-on point, brake-off point, time-to-full-throttle (≥90%) from apex.</li>
    <li><strong>Driver dominance map</strong>: lap binned into 120 distance segments. Per-driver time-through-segment computed via interpolation. The fastest driver wins each segment; segment is rendered in their colour.</li>
  </ul>

  <h2>Data sources</h2>
  <p><strong>OpenF1.org</strong> — telemetry, lap timing, sectors, stints, pit stops, weather, race control, session results. Cached aggressively in Cloudflare R2 so most page loads serve from cache and the OpenF1 API isn't hit on the hot path.</p>
  <p><strong>Groq</strong> — Llama 3.3 70B for the race verdicts. Streamed via a Cloudflare Worker so the API key never reaches the browser.</p>

  <h2>Open source</h2>
  <p>Source code at <a href="https://github.com/vassilispapadop/openf1ow" rel="noopener">github.com/vassilispapadop/openf1ow</a>. MIT licensed. React 18, TypeScript, Vite 6, Cloudflare Workers + Pages, R2.</p>

  <h2>What it isn't</h2>
  <ul>
    <li><strong>Live timing.</strong> F1.com and the F1 app are licensed for that. We focus on post-race depth.</li>
    <li><strong>Affiliated with Formula 1.</strong> Independent project. F1, Formula 1 and related marks are trademarks of Formula One Licensing B.V.</li>
    <li><strong>A paid product.</strong> No accounts, no subscriptions, no ads. If something stops working it's because the data source is rate-limited or down.</li>
  </ul>

  <footer class="site">
    Data from <a href="https://openf1.org">OpenF1 API</a> · <a href="/">Home</a> · <a href="/insights">Recaps</a>
  </footer>
</div>
</body>
</html>`;

export function handleAboutRequest(opts: { url: URL }): Response | null {
  if (opts.url.pathname !== "/about" && opts.url.pathname !== "/about/") return null;
  return new Response(ABOUT_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
