# Implementation Checklist — Growth & Improvement Plan

## Phase 1: Foundation (SEO, GitHub, Analytics) ✅

### SEO Infrastructure
- [x] `robots.txt` — created at `/static/robots.txt`
- [x] Sitemap index — created at `/static/sitemap-index.xml`
- [x] Dynamic race sitemap — added `generateRaceSitemap()` to Worker
- [x] OG tags enhanced — richer per-page descriptions with driver/session context
- [x] JSON-LD structured data — already implemented (SportsEvent schema)
- [x] Cloudflare route for sitemaps — added `/sitemap.xml` and `/sitemap-races.xml` to `run_worker_first`

### GitHub Repository
- [x] README.md — expanded with badges, features, tech stack, structure
- [ ] GitHub Topics — add 10 discoverability topics (manual)
- [ ] Issue templates — create `.github/ISSUE_TEMPLATE/` (manual)
- [ ] CONTRIBUTING.md — add contribution guide (manual)
- [ ] Release tag v1.0.0 — create git tag (manual)

### Analytics
- [ ] Cloudflare Analytics Engine dataset `openf1ow_usage` — create in dashboard (manual)
- [ ] Google Analytics 4 — verify tracking with Real-Time report (manual)
- [ ] Search Console verification — submit to Google (manual)
- [ ] Search Console sitemap submission — submit `/sitemap.xml` (manual)

## Phase 2: Traffic Drivers (Race Counters, Engagement) ✅

### Race Countdown Component
- [x] `RaceCountdown.tsx` — created with live/pulse indicator and countdown timer
- [x] Added to `HomePage.tsx` — sticky banner above next race card
- [x] Pulse animation — added `@keyframes pulse` to `index.css`
- [ ] Test during race weekend — verify it appears at the right time

### Enhanced Live Banner
- [x] `LiveSessionBanner.tsx` — already has dismiss + F1.com link
- [ ] Optional: add "Share on X" button

## Phase 3: Monetization & Lead Gen (Prepared, Not Active)

### Newsletter Signup
- [x] `NewsletterSignup.tsx` — Race Weekend Alerts component created
- [x] Homepage integration slot ready
- [ ] Configure email provider URL (MailerLite/Buttondown/Mailchimp)
- [ ] Add to homepage (drop into grid below HotStats)

### Social Share Card
- [x] `SocialShareCard.tsx` — race card image generator created
- [ ] Test OG image generation endpoint
- [ ] Add to analysis pages as "Share this race" button

## Phase 4: Content & Community (Post-Race Workflow)

### Social Media Templates
- [x] `Social-Media-Templates.md` — X/Reddit/YouTube/Facebook templates
- [x] Post-race checklist in templates

### SEO Guide
- [x] `SEO-Guide.md` — target queries, maintenance checklist, competitor analysis
- [x] Post-race SEO workflow documented

### Analytics Setup
- [x] `Analytics-Setup.md` — CF AE dashboard creation, GA4 verification
- [x] GitHub Setup Guide — topics, templates, contributing

---

## Quick Wins (Already Implemented)

| Item | Status | Impact |
|------|--------|--------|
| `robots.txt` | ✅ Done | Crawl access guaranteed |
| Dynamic sitemap | ✅ Done | Google indexes every race |
| Enhanced OG tags | ✅ Done | Better social shares |
| Race countdown | ✅ Done | Race-day engagement spike |
| Pulse animation | ✅ Done | Visual live indicator |
| README expanded | ✅ Done | GitHub discoverability |
| Social templates | ✅ Done | Post-race content ready |
| SEO guide | ✅ Done | Organic traffic strategy |

## Manual Actions Required

These require user intervention — not automated:

1. **Create CF Analytics Engine dataset** (`openf1ow_usage`)
2. **Submit sitemap to Google Search Console**
3. **Add GitHub topics** (10 discoverability keywords)
4. **Configure newsletter provider URL** in `NewsletterSignup.tsx`
5. **Test RaceCountdown** during next race weekend
6. **Verify Analytics Engine** writes events
