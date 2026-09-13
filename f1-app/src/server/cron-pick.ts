// Which session the next cron tick works on. Pure — no Workers types — so
// it is unit-tested with the engine.

/** Wait after date_end before the first pass: OpenF1's live paywall lifts
 *  ~30 min after the flag and the timing data keeps landing for a while. */
export const FIRST_PASS_DELAY_MS = 45 * 60_000;
export const SECOND_PASS_DELAY_MS = 48 * 3_600_000;
export const HORIZON_MS = 7 * 86_400_000;

export interface SessionRow { session_key: number; meeting_key: number; session_name: string; session_type: string; date_start: string; date_end: string }
export interface DoneMarker { pass1At?: string; pass2At?: string }

/** Which session (and pass) the next tick should work on: the oldest that
 *  ended more than FIRST_PASS_DELAY ago, within the horizon, and either has
 *  no first pass or is due its second. Pure, for tests. */
export function pickSession(rows: SessionRow[], done: Map<number, DoneMarker>, now: number): { row: SessionRow; pass: 1 | 2 } | null {
  const due = rows
    .map(r => ({ r, end: Date.parse(r.date_end) }))
    .filter(x => Number.isFinite(x.end) && now > x.end + FIRST_PASS_DELAY_MS && now < x.end + HORIZON_MS)
    .sort((a, b) => a.end - b.end);
  for (const { r, end } of due) {
    const m = done.get(r.session_key);
    if (!m?.pass1At) return { row: r, pass: 1 };
    if (!m.pass2At && now > end + SECOND_PASS_DELAY_MS) return { row: r, pass: 2 };
  }
  return null;
}

