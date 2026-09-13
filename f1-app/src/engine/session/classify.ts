import type { SessionInfo } from "../types/raw.ts";
import type { SessionKind } from "../types/model.ts";

/** Lap-count ceiling for "this is a sprint". F1 sprints run 17–25 laps;
 *  Grands Prix 44–78. Used only when the session name does not say. */
export const SPRINT_LAP_THRESHOLD = 30;

/** Categorise a session by OpenF1's `session_type`, with the name as a
 *  tiebreak — sprints report type "Race", sprint qualifying reports
 *  "Qualifying". */
export function classifySession(sessionType: string | undefined, sessionName?: string): SessionKind {
  const t = (sessionType || "").toLowerCase();
  const n = (sessionName || "").toLowerCase();
  if (t === "race" || n === "race" || n === "sprint") return "race";
  if (t === "qualifying" || /^(sprint\s*qualifying|sprint\s*shootout)$/.test(n) || n === "qualifying") return "qualifying";
  if (t === "practice" || n.startsWith("practice") || /^fp\d$/.test(n)) return "practice";
  return "unknown";
}

/** Sprint detection: the session name is authoritative; lap count is the
 *  fallback for feeds where the name is just "Race". */
export function isSprint(info: SessionInfo | null | undefined, totalLaps: number): boolean {
  const n = (info?.session_name || "").toLowerCase();
  if (n === "sprint") return true;
  if (n === "race") return false;
  return totalLaps > 0 && totalLaps <= SPRINT_LAP_THRESHOLD;
}
