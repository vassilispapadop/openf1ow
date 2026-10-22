# OpenF1ow SEO Guide

This guide documents everything needed to maintain and grow organic traffic from Google Search.

## 1. Google Search Console

### Initial Setup
1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Add property: `https://www.openf1ow.com`
3. Verify ownership — use **HTML file upload**:
   - Upload the file provided by Google Search Console to your Cloudflare Pages deploy
   - Or use DNS TXT record verification

### Sitemap Submission
After verifying, submit two sitemaps:
- `https://www.openf1ow.com/sitemap.xml` (index)
- The race pages sitemap is generated dynamically at `/sitemap-races.xml`

### Monitoring
- Check **Coverage** tab weekly — fix any 404s or server errors
- Check **Enhancements** — JSON-LD should show 0 errors (already implemented)
- Check **Performance** → filter by `Page` to see top queries
- Key metrics to track: impressions, clicks, CTR, average position

## 2. Key Target Queries

| Query Intent | Target Page | Search Volume (est.) |
|-------------|-------------|---------------------|
| "[year] F1 race analysis" | `/[year]/[meeting_key]/[session_key]/analysis/overview` | High |
| "F1 tire strategy [race name]" | Same analysis pages | Medium |
| "F1 telemetry [driver name]" | `/[year]/[meeting_key]/[session_key]/[driver_id]/telemetry` | Medium |
| "F1 sector analysis" | Analysis pages | Low-Medium |
| "F1 pit stop timing" | Analysis pages | Low-Medium |
| "OpenF1ow F1" | Homepage | Low (brand) |

## 3. JSON-LD Structured Data

Already implemented in `src/server/index.ts`:
```json
{
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  "name": "2024 Monaco Grand Prix",
  "sportsEvent": { ... },
  "athlete": { "name": "Charles Leclerc" },
  "location": { "name": "Circuit de Monaco" },
  "startDate": "2024-05-26T13:00:00Z",
  "description": "Deep F1 telemetry analysis..."
}
```

### Verification
Use [Google's Rich Results Test](https://search.google.com/test/rich-results) to validate.

## 4. Technical SEO Checklist

- [x] robots.txt — allows all crawlers (created in `/static/robots.txt`)
- [x] sitemap.xml — dynamic XML with race URLs (Worker endpoint)
- [x] OpenGraph tags — dynamic per-page (Worker injection)
- [x] JSON-LD structured data — SportsEvent schema
- [x] Canonical URLs — set via Worker response headers
- [x] Mobile responsive — all pages use responsive CSS
- [ ] PageSpeed Insights — target >90 on all pages
- [ ] Core Web Vitals — monitor LCP, CLS, INP
- [ ] Internal linking — ensure all race links from homepage

## 5. Content Strategy for SEO

### Race Pages (Highest Priority)
Each race session generates a unique page that Google indexes. These are your primary traffic drivers:
- **Title format**: `[Session] — [Driver] | [Year] [GP Name] | OpenF1ow`
- **Description format**: `Deep F1 telemetry analysis: [driver] [session] — lap-by-lap timing, speed traces, sector splits, tire degradation, pit strategies and AI-powered race commentary for the [year] [GP Name].`
- These are automatically set by the Worker's OG/JSON-LD injection

### Homepage
- Title: "OpenF1ow — Free F1 Telemetry Dashboard & Race Analysis"
- Description: "Live F1 telemetry, lap-by-lap timing, tire strategies, AI race commentary. Free forever."

### Season Pages
- Title: "[Year] F1 Season — OpenF1ow"
- Links to all races in that season

## 6. Post-Race Checklist

After every Grand Prix:
1. [ ] Verify race page appears in Google Search Console (check Coverage)
2. [ ] Share race analysis on social media (use SocialShareCard component)
3. [ ] Submit race page URL for indexing via Search Console "URL Inspection"
4. [ ] Track new rankings for target queries in Performance report

## 7. Competitor Keywords to Target

| Competitor | What They Rank For | OpenF1ow Opportunity |
|-----------|-------------------|---------------------|
| F1.com | Live timing, results | Deep telemetry, analysis |
| StatsF1 | Historical data | Real-time analysis, AI insights |
| Formula1.com | News, highlights | Telemetry, sector analysis |
| The Race (TheF1) | Analysis articles | Interactive telemetry |
| PitPass | Fan analysis | Professional-grade data |

## 8. Ongoing Maintenance

- **Monthly**: Check Search Console for new crawl errors
- **Monthly**: Update sitemaps (auto-generated, but verify in SC)
- **Post-season**: Archive old season pages, update homepage with latest season
- **Race weekend**: Monitor for sudden traffic spikes, check server performance
