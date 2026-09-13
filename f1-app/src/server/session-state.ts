// Where a session is in its life decides how long its data may be cached.
//
//   upcoming  — before the paywall window opens: nothing worth caching long
//   live      — ±30 min around the session: OpenF1 paywalls the public API,
//               so serve whatever R2 has and never spend upstream calls
//   recent    — up to 48 h after the end: results, penalties and late laps
//               still arrive, so refresh every 15 minutes
//   settled   — after that: immutable, cache forever
//
// The window comes from the `sessions?year=` list the proxy already caches
// (1 h TTL), with a per-session lookup as fallback for older seasons.

export type SessionState = "upcoming" | "live" | "recent" | "settled" | "unknown";

export interface SessionWindow {
  session_key: number;
  meeting_key: number;
  date_start: number;   // epoch ms
  date_end: number;
  year: number;
}

const LIVE_PAD_MS = 30 * 60_000;
const RECENT_MS = 48 * 3_600_000;
const MEMO_MS = 5 * 60_000;

interface Row { session_key: number; meeting_key: number; date_start: string; date_end: string; year?: number }

const memo = new Map<number, { w: SessionWindow | null; at: number }>();
let yearList: { rows: Row[]; at: number } | null = null;

export type Fetcher = (apiPath: string) => Promise<{ ok: boolean; status: number; body: string }>;

function toWindow(r: Row): SessionWindow | null {
  const s = Date.parse(r.date_start), e = Date.parse(r.date_end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return { session_key: r.session_key, meeting_key: r.meeting_key, date_start: s, date_end: e, year: r.year ?? new Date(s).getUTCFullYear() };
}

/** Rows of the current year's session list — from R2 if fresh, else upstream. */
async function currentYearRows(bucket: R2Bucket, fetcher: Fetcher, year: number): Promise<Row[]> {
  if (yearList && Date.now() - yearList.at < MEMO_MS) return yearList.rows;
  const key = `sessions?year=${year}`;
  let rows: Row[] | null = null;
  try {
    const obj = await bucket.get(key);
    if (obj) {
      const fetchedAt = Number(obj.customMetadata?.fetchedAt) || obj.uploaded.getTime();
      if (Date.now() - fetchedAt < 3_600_000) rows = JSON.parse(await obj.text());
    }
  } catch { /* fall through */ }
  if (!rows) {
    try {
      const up = await fetcher(`/sessions?year=${year}`);
      if (up.ok) {
        rows = JSON.parse(up.body);
        await bucket.put(key, up.body, { httpMetadata: { contentType: "application/json" }, customMetadata: { fetchedAt: String(Date.now()) } });
      }
    } catch { /* keep null */ }
  }
  yearList = { rows: rows ?? [], at: Date.now() };
  return yearList.rows;
}

export async function getSessionWindow(sk: number, bucket: R2Bucket, fetcher: Fetcher): Promise<SessionWindow | null> {
  const m = memo.get(sk);
  if (m && Date.now() - m.at < MEMO_MS) return m.w;
  const year = new Date().getUTCFullYear();
  let w: SessionWindow | null = null;
  const rows = await currentYearRows(bucket, fetcher, year);
  const hit = rows.find(r => r.session_key === sk);
  if (hit) w = toWindow(hit);
  if (!w) {
    // Older season (or the list is stale): one lookup, cached in R2 forever.
    const key = `sessions?session_key=${sk}`;
    try {
      const obj = await bucket.get(key);
      const rowsOne: Row[] | null = obj ? JSON.parse(await obj.text()) : null;
      if (rowsOne?.[0]) w = toWindow(rowsOne[0]);
      else {
        const up = await fetcher(`/sessions?session_key=${sk}`);
        if (up.ok) {
          const parsed: Row[] = JSON.parse(up.body);
          if (parsed[0]) {
            w = toWindow(parsed[0]);
            await bucket.put(key, up.body, { httpMetadata: { contentType: "application/json" }, customMetadata: { fetchedAt: String(Date.now()) } });
          }
        }
      }
    } catch { /* unknown */ }
  }
  memo.set(sk, { w, at: Date.now() });
  return w;
}

export function classifyState(w: SessionWindow | null, now = Date.now()): SessionState {
  if (!w) return "unknown";
  if (now < w.date_start - LIVE_PAD_MS) return "upcoming";
  if (now <= w.date_end + LIVE_PAD_MS) return "live";
  if (now <= w.date_end + RECENT_MS) return "recent";
  return "settled";
}

/** The first moment a complete snapshot of a session could exist. */
export function settledAt(w: SessionWindow): number {
  return w.date_end + LIVE_PAD_MS;
}

/** Test hook. */
export function resetSessionStateMemo(): void {
  memo.clear();
  yearList = null;
}
