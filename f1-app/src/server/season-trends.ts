// Worker handler for /api/season-trends/:year — reads the precomputed
// season-trends/{year}.json artifact from R2 and serves it as JSON.
//
// The artifact is built offline by scripts/compute-season-trends.mjs and
// uploaded to the F1_DATA bucket. This handler does no computation.

const TRENDS_PREFIX = "season-trends/";
const CACHE_CONTROL = "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400";

export async function handleSeasonTrendsRequest(opts: {
  url: URL;
  F1_DATA: R2Bucket;
}): Promise<Response | null> {
  const m = opts.url.pathname.match(/^\/api\/season-trends\/(\d{4})\/?$/);
  if (!m) return null;
  const year = m[1];

  try {
    const obj = await opts.F1_DATA.get(`${TRENDS_PREFIX}${year}.json`);
    if (!obj) {
      return new Response(
        JSON.stringify({ error: "season-trends not found", year }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    const body = await obj.text();
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CACHE_CONTROL,
        "Last-Modified": obj.uploaded.toUTCString(),
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "season-trends fetch failed", message: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
