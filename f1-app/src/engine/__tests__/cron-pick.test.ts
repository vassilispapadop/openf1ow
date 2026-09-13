import { describe, it, expect } from "vitest";
import { pickSession, FIRST_PASS_DELAY_MS, SECOND_PASS_DELAY_MS, HORIZON_MS, type SessionRow, type DoneMarker } from "../../server/cron-pick";

const H = 3_600_000;
const row = (sk: number, endMsAgo: number, now: number): SessionRow => ({
  session_key: sk, meeting_key: 1, session_name: "Race", session_type: "Race",
  date_start: new Date(now - endMsAgo - 2 * H).toISOString(), date_end: new Date(now - endMsAgo).toISOString(),
});

describe("cron pickSession", () => {
  const now = Date.parse("2026-09-13T16:00:00Z");
  it("waits FIRST_PASS_DELAY after the flag", () => {
    expect(pickSession([row(1, FIRST_PASS_DELAY_MS - 60_000, now)], new Map(), now)).toBeNull();
    expect(pickSession([row(1, FIRST_PASS_DELAY_MS + 60_000, now)], new Map(), now)?.pass).toBe(1);
  });
  it("takes the oldest due session first and ignores ones past the horizon", () => {
    const rows = [row(3, 2 * H, now), row(1, HORIZON_MS + H, now), row(2, 5 * H, now)];
    expect(pickSession(rows, new Map(), now)?.row.session_key).toBe(2);
  });
  it("schedules the second pass only after 48 h, and not again", () => {
    const done = new Map<number, DoneMarker>([[2, { pass1At: "x" }]]);
    expect(pickSession([row(2, 5 * H, now)], done, now)).toBeNull();
    expect(pickSession([row(2, SECOND_PASS_DELAY_MS + H, now)], done, now)?.pass).toBe(2);
    done.set(2, { pass1At: "x", pass2At: "y" });
    expect(pickSession([row(2, SECOND_PASS_DELAY_MS + H, now)], done, now)).toBeNull();
  });
});
