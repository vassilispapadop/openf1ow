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
    <li><strong>Clean laps</strong>: a lap counts when it has a time and none of: lap 1, pit in/out, safety car, virtual safety car, red flag, 20 % or more under a sector yellow, after a retirement, or more than 3 MAD above its own stint&rsquo;s median (fuel-corrected). Every card states its minimum sample and shows the reason when a driver falls below it &mdash; nothing is reported as a silent zero.</li>
    <li><strong>Race pace</strong>: median clean lap, corrected to race-end fuel load. The fuel effect is fitted per race from same-compound, equal-tyre-age lap pairs across stints (accepted with 12+ pairs inside 0.025&ndash;0.08 s/kg); otherwise 0.055 s/kg. Start load 110 kg for a Grand Prix, 40 kg for a sprint. Every median carries a 1&thinsp;000-sample bootstrap 95 % interval. <em>True pace</em> additionally requires clear air and normalises tyre age with each stint&rsquo;s own fitted degradation.</li>
    <li><strong>Traffic</strong>: from the timing feed&rsquo;s intervals at the start of each lap &mdash; never from lap timestamps. Dirty air is under 1.5 s to the car ahead; the cost is the loss against the same stint&rsquo;s clear-air median, binned by gap. When intervals are not published the traffic analyses say so rather than estimate.</li>
    <li><strong>Tyre degradation</strong>: per stint, ordinary least squares of fuel-corrected lap time against tyre age over clean clear-air laps from tyre age 2, at least five laps, reported with its 95 % interval, R&sup2; and a robust (Theil&ndash;Sen) cross-check. Slopes are not clamped &mdash; a negative slope is a tyre still coming in. A two-segment fit flags a cliff when it beats one line by &Delta;BIC &gt; 6.</li>
    <li><strong>Teammates</strong>: paired laps &mdash; same lap number, both clean, both in the same traffic state &mdash; fuel-corrected; median delta with a bootstrap interval and a paired sign test. Every driver who ran for a team is considered. Head-to-head lap counts use the same paired set, so the two figures can never name different winners.</li>
    <li><strong>Constructor pace</strong>: every driver&rsquo;s clean laps pooled per team, fuel-corrected, with a bootstrap interval; the season view keeps a driver only if they covered 75 % of the race distance.</li>
    <li><strong>Consistency</strong>: one sample standard deviation of clean clear-air fuel-corrected laps, with the MAD-based robust &sigma; beside it.</li>
    <li><strong>Sectors</strong>: median sector against the field&rsquo;s best median; theoretical lap = a driver&rsquo;s own best sectors summed; speed traps split into clear-air (&ge; 1.5 s to the car ahead) and in tow (&lt; 1.0 s).</li>
    <li><strong>Neutralisations, starts, overtakes</strong>: safety-car, VSC and red-flag windows from race control; grid from the starting-grid feed (else qualifying, else the position feed before the start); overtakes from the overtakes feed classified as on-track, pit-cycle, lapping or under safety car.</li>
    <li><strong>Qualifying and practice</strong>: segments (Q1/Q2/Q3) from gaps in running; push laps within 3 % of a driver&rsquo;s own best; track evolution as a regression of push-lap time on session time with a fixed effect per driver.</li>
    <li><strong>Cornering analysis</strong>: corner apexes detected as local minima in the speed trace. For each corner: brake-on point, brake-off point, time-to-full-throttle (&ge;90 %) from apex.</li>
    <li><strong>Driver dominance map</strong>: lap binned into 120 distance segments. Per-driver time-through-segment computed via interpolation. The fastest driver wins each segment; segment is rendered in their colour.</li>
  </ul>

  <p>Every figure on the site &mdash; race page, recap, share card, home page &mdash; is produced by one open-source analytics engine (<code>src/engine</code>) run on the same session data, so the numbers agree everywhere. Each card has a &ldquo;How this is computed&rdquo; note with its method, sample and caveats.</p>

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
