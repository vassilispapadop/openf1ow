// The most recent race that has actually started this season — keyed off
// the real Race-session start, not the weekend's Friday, so an upcoming GP
// does not read as "latest" during its practice days. Shared by the home
// page's debrief and standings cards.

import { api } from "./api";
import { loadRaceIndex } from "./raceIndex";

export interface LatestRaceRef {
  year: number;
  slug: string;
  meetingKey: number;
  raceSk: number | null;
  meetingName: string;
  location: string;
  country: string;
  dateStart: string;
  raceStart: number;        // epoch ms
}

const memo = new Map<number, Promise<LatestRaceRef | null>>();

export function findLatestRace(year: number): Promise<LatestRaceRef | null> {
  let p = memo.get(year);
  if (!p) {
    p = compute(year).catch(() => null);
    memo.set(year, p);
  }
  return p;
}

async function compute(year: number): Promise<LatestRaceRef | null> {
  const idx = await loadRaceIndex();
  const list = idx?.byYear[String(year)];
  if (!list) return null;
  const now = Date.now();
  const raceStartByMeeting: Record<number, number> = {};
  try {
    const sessions = (await api(`/sessions?year=${year}`)) as Array<{ meeting_key: number; session_name: string; date_start?: string }>;
    if (Array.isArray(sessions)) for (const s of sessions) if (s.session_name === "Race" && s.date_start) raceStartByMeeting[s.meeting_key] = new Date(s.date_start).getTime();
  } catch { /* fall back to dateStart */ }
  const raceStart = (r: { meetingKey: number; dateStart?: string }) => raceStartByMeeting[r.meetingKey] ?? (r.dateStart ? new Date(r.dateStart).getTime() : 0);
  const past = list.filter(r => r.sessions?.race && raceStart(r) > 0 && raceStart(r) < now).sort((a, b) => raceStart(b) - raceStart(a));
  const latest = past[0];
  if (!latest) return null;
  return {
    year, slug: latest.slug, meetingKey: latest.meetingKey, raceSk: latest.sessions?.race ?? null,
    meetingName: latest.meetingName, location: latest.location, country: latest.country, dateStart: latest.dateStart, raceStart: raceStart(latest),
  };
}
