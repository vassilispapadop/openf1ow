# Cloudflare Analytics Engine Setup Guide

## Step 1: Create the Dataset

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your account → **Analytics Engine**
3. Click **Create Dataset**
4. Name: `openf1ow_usage`
5. Region: Auto (or us-east-1 if you need US-focused)
6. Retention: 30 days (minimum for cost-effective operation)

## Step 2: Verify the Worker is Writing

The Worker at `/api/usage` already writes events. Test it:

```bash
curl -X POST https://www.openf1ow.com/api/usage \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","page":"test","session_key":"","timestamp":'"$(date +%s)"'}'
```

Then check the dataset in the Cloudflare Dashboard → **Analytics Engine** → **openf1ow_usage** → **Explore**

You should see at least 1 event within 1-2 minutes.

## Step 3: Create Dashboards

### Dashboard 1: Traffic Overview
- **Total visits** (unique user_id count) — daily bar chart
- **Top pages** (group by page) — top 10 table
- **Sessions per day** (unique session_id count) — line chart
- **Geographic distribution** (group by geo.country) — map visualization

### Dashboard 2: Race Engagement
- **Most viewed races** (group by page containing session_key) — top 10 table
- **Analysis tab engagement** (group by page containing /analysis/) — pie chart
- **Telemetry page views** (group by page containing /telemetry) — bar chart
- **Session duration** — histogram (if you add a duration field)

### Dashboard 3: Technical Performance
- **Error rate** (group by status code) — gauge
- **API response times** (if you add a latency field) — histogram
- **Cloudflare Worker invocations** — line chart

## Step 4: Cost Management

- **Storage**: ~$0.05/GB/month — 30-day retention keeps this low
- **Queries**: Free tier includes 100GB/month of scanned data
- Set up alerts in Cloudflare Dashboard for unusual spikes

## Step 5: Integrate with Google Analytics

The Worker already writes to both:
1. **Cloudflare Analytics Engine** (`openf1ow_usage`) — detailed, free, real-time
2. **Google Analytics 4** (`G-W8MHMCEZRQ`) — via existing GA4 integration

Use CF Analytics Engine for real-time dashboards, GA4 for long-term trends and user journey analysis.

## Step 6: Add Event Enrichment

The current `/api/usage` endpoint already captures:
- `user_id` (session hash)
- `page` (URL path)
- `session_key` (from URL query)
- `timestamp`

Consider adding these fields for richer analysis:
- `referrer` — to track traffic sources
- `device_type` — mobile vs desktop
- `country` — from Cloudflare's geoIP
- `race_id` — extracted from URL path

Example enriched event:
```json
{
  "user_id": "sha256(sessionId)",
  "page": "/2024/monaco/qualifying/overview",
  "session_key": "12345",
  "race_id": "monaco_2024",
  "timestamp": 1729536000,
  "device": "mobile",
  "country": "GB",
  "referrer": "reddit.com/r/F1"
}
```
