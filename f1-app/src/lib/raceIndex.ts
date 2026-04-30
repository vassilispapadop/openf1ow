// Client-side helper to resolve numeric meeting_key -> slug using the
// /race-index.json shipped as a static asset. Cached in module scope.
//
// Worker-side recap pages live at /recap/:year/:slug — to share them from the
// SPA, we need to translate the current numeric mk into a slug.

interface RaceEntry {
  slug: string;
  meetingKey: number;
  meetingName: string;
  location: string;
  country: string;
  dateStart: string;
  sessions: Record<string, number>;
}

interface RaceIndex {
  generatedAt: string;
  byYear: Record<string, RaceEntry[]>;
}

let promise: Promise<RaceIndex | null> | null = null;

export function loadRaceIndex(): Promise<RaceIndex | null> {
  if (promise) return promise;
  promise = fetch("/race-index.json")
    .then(r => (r.ok ? r.json() as Promise<RaceIndex> : null))
    .catch(() => null);
  return promise;
}

export async function findSlugForMeeting(year: number | string, mk: string): Promise<string | null> {
  const idx = await loadRaceIndex();
  if (!idx) return null;
  const list = idx.byYear[String(year)];
  if (!list) return null;
  const match = list.find(r => String(r.meetingKey) === String(mk));
  return match?.slug || null;
}
