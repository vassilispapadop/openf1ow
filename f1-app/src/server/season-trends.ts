// /api/season-trends/:year — passthrough read of the offline-built
// season-trends/{year}.json from R2.

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
