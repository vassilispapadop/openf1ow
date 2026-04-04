# OpenF1ow

Real-time Formula 1 telemetry dashboard and race analysis platform powered by the [OpenF1 API](https://openf1.org).

**Live:** [www.openf1ow.com](https://www.openf1ow.com)

## Features

### Driver View
- **Lap-by-lap data** with sector times, speeds, and pit stop info
- **Live telemetry** — speed, throttle, brake, gear, DRS traces per lap
- **Multi-driver comparison** — overlay telemetry from different drivers/laps
- **Position tracking** and race control messages

### Race Analysis
- **Race Pace Ranking** — median pace with box plot distributions and consistency metrics
- **Sector Analysis** — sector deltas, speed traps, theoretical best laps, consistency heatmap
- **Tire Degradation** — fuel-corrected deg/lap per stint, compound comparison summary
- **Constructor Pace** — team-level aggregation with intra-team driver gap analysis
- **Teammate Battles** — head-to-head lap wins and pace comparison
- **Pit Stop Efficiency** — crew rankings, pit window timeline
- **Dirty Air Analysis** — traffic heatmap, time loss quantification, gap vs loss scatter
- **Weather Correlation** — temperature vs pace scatter, driver adaptability
- **Fuel Model** — estimated fuel load curve and cumulative time gain
- **Scatter Plots** across all tabs for deeper correlation analysis

### AI Race Analysis
- **Gemini-powered** natural language race breakdown
- Covers strategy, battles, tire management, and race verdict
- Streamed in real-time with markdown rendering

### Other
- **URL-based navigation** — shareable deep links, browser back/forward
- **JSON export** — download race summary data for external analysis
- **API response caching** — instant navigation on revisit
- **Hover tooltips** on all charts and graphs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 |
| Hosting | Cloudflare Workers + Pages |
| Data | [OpenF1 API](https://openf1.org) |
| AI | Google Gemini API (via Cloudflare Worker proxy) |
| Charts | Custom canvas rendering (no chart library) |

## Getting Started

```bash
cd f1-app
npm install
npm run dev
```

### Environment Setup

For AI analysis, set the Gemini API key as a Cloudflare Worker secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

### Deploy

```bash
npm run deploy
```

Or push to `master` — Cloudflare auto-deploys via GitHub integration.

## Project Structure

```
f1-app/
  src/
    App.tsx              # Main app — driver view, telemetry, selectors
    RaceAnalysis.tsx     # Race analysis — all analysis tabs and charts
    components/
      AIAnalysis.tsx     # AI-powered race narrative (Gemini streaming)
    lib/
      buildAnalysisSummary.ts  # Compact race summary builder for LLM
      raceUtils.ts       # Shared math (median, linear regression, etc.)
      styles.ts          # Shared style constants
      types.ts           # TypeScript interfaces (Driver, Lap, Stint, etc.)
      useUrlState.ts     # URL ↔ state sync hook
    server/
      index.ts           # Cloudflare Worker — Gemini API proxy
  wrangler.jsonc         # Cloudflare deployment config
```

## License

MIT
