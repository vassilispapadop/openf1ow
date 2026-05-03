// Slug-URL → numeric-URL 301 redirects. Lets external links + sitemap
// use memorable URLs like /2024/imola/race/pace while the SPA continues
// to render off the numeric routes it already supports.
//
// Patterns handled:
//   /:year/:slug                                    → /:year/:mk
//   /:year/:slug/:sessionType                       → /:year/:mk/:sk/analysis/overview
//   /:year/:slug/:sessionType/:subTab               → /:year/:mk/:sk/analysis/:subTab
//   /:year/:slug/:sessionType/driver/:dn[/:tab]     → /:year/:mk/:sk/driver/:dn[/:tab]
//
// `:sessionType` accepts the keys we use in race-index.json sessions:
// race, qualifying, sprint, sprintqualifying, fp1, fp2, fp3.

import { loadRaceIndex } from "./recap";

const KNOWN_SESSION_TYPES = new Set([
  "race", "qualifying", "sprint", "sprintqualifying",
  "fp1", "fp2", "fp3",
]);

const SLUG_ANALYSIS_TABS = new Set([
  "overview", "pace", "strategy", "battles", "track",
  // accept legacy aliases too — the SPA's TAB_REDIRECT will normalise.
  "ai", "commentary", "sectors", "evolution", "degradation",
  "fuel", "pitstops", "teammates", "constructors", "dirtyair",
  "weather", "clipping", "replay",
]);

export async function handleSlugRedirect(opts: {
  url: URL;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}): Promise<Response | null> {
  const { url, ASSETS } = opts;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 2) return null;

  // First segment must be a 4-digit year, second must be a non-numeric slug.
  // (Numeric meeting_keys are 4-digit ints — bail to leave existing routes alone.)
  if (!/^\d{4}$/.test(segs[0])) return null;
  if (/^\d+$/.test(segs[1])) return null;
  if (!/^[a-z][a-z0-9-]*$/.test(segs[1])) return null;
  // Don't shadow worker-rendered routes (recap, insights, share, api).
  if (["recap", "insights", "share", "api", "trends", "about"].includes(segs[1])) return null;
  // Don't shadow /:year/trends specifically.
  if (segs[1] === "trends") return null;

  const idx = await loadRaceIndex(ASSETS, url.origin);
  if (!idx) return null;
  const races = idx.byYear[segs[0]];
  if (!races) return null;
  const race = races.find(r => r.slug === segs[1]);
  if (!race) return null;

  const year = segs[0];
  const mk = String(race.meetingKey);

  // /:year/:slug → /:year/:mk
  if (segs.length === 2) {
    return permanent(`/${year}/${mk}${url.search}`);
  }

  // The third segment is either a sessionType slug or "trends" (already handled).
  const sessionType = segs[2];
  if (!KNOWN_SESSION_TYPES.has(sessionType)) return null;
  const sk = race.sessions[sessionType];
  if (sk == null) {
    // Session-type known but this race doesn't have it (e.g. sprint at a
    // non-sprint weekend). Fall through to the meeting page.
    return permanent(`/${year}/${mk}${url.search}`);
  }
  const skStr = String(sk);

  // /:year/:slug/:sessionType
  if (segs.length === 3) {
    return permanent(`/${year}/${mk}/${skStr}/analysis/overview${url.search}`);
  }

  const fourth = segs[3];

  // /:year/:slug/:sessionType/:subTab — analysis sub-tab shorthand
  if (segs.length === 4 && SLUG_ANALYSIS_TABS.has(fourth)) {
    return permanent(`/${year}/${mk}/${skStr}/analysis/${fourth}${url.search}`);
  }

  // /:year/:slug/:sessionType/analysis[/:subTab]
  if (fourth === "analysis") {
    const subTab = segs[4] || "overview";
    return permanent(`/${year}/${mk}/${skStr}/analysis/${subTab}${url.search}`);
  }

  // /:year/:slug/:sessionType/driver/:dn[/:tab]
  if (fourth === "driver" && segs[4] && /^\d{1,3}$/.test(segs[4])) {
    const dn = segs[4];
    const tab = segs[6] || "laps";
    return permanent(`/${year}/${mk}/${skStr}/driver/${dn}/${tab}${url.search}`);
  }

  return null;
}

function permanent(location: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
