// Draft X posts from a stored insights artifact. Pure — no Workers types — so it
// is unit-tested. The text is templated from the engine's own verdict headlines,
// never generated, so a post always says what the site says.

export interface DraftVerdict {
  id: string;
  area: string;
  impact: number;
  confidence: string;
  headline: string;
  evidence?: { tab?: string };
}
export interface DraftInput {
  session: { key: number; name: string; meeting: string; year: number };
  verdicts: DraftVerdict[];
}
export interface Draft { id: string; verdictId: string; text: string; url: string; weightedLength: number }
export interface DraftSet { sessionKey: number; generatedAt: string; handle: string; drafts: Draft[] }

export const HANDLE = "@openf1ow";
const MAX = 280;
const URL_WEIGHT = 23; // X counts every link as 23 characters
const MAX_DRAFTS = 3;

const weighted = (text: string) => text.length + 2 + URL_WEIGHT; // "\n\n" + link

/** Trim a headline to `room` characters at a word boundary, with an ellipsis. */
function fit(s: string, room: number): string {
  if (s.length <= room) return s;
  const cut = s.slice(0, room - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), room >> 1)).replace(/[\s,;:.]+$/, "") + "…";
}

export function buildDrafts(input: DraftInput, mk: number, origin: string, now = new Date()): DraftSet {
  const { session } = input;
  const label = `${session.year} ${session.meeting} ${session.name}`;
  const tag = "#F1";
  // Best verdict per area, highest impact first; low-confidence ones are not
  // worth a public claim.
  const seen = new Set<string>();
  const picks = [...input.verdicts]
    .filter(v => v.confidence !== "low" && v.headline)
    .sort((a, b) => b.impact - a.impact)
    .filter(v => (seen.has(v.area) ? false : (seen.add(v.area), true)))
    .slice(0, MAX_DRAFTS);

  const drafts: Draft[] = picks.map((v, i) => {
    const url = `${origin}/${session.year}/${mk}/${session.key}/analysis/${v.evidence?.tab || "overview"}`;
    const head = `${label}\n\n`;
    const tail = `\n${tag}`;
    const room = MAX - URL_WEIGHT - 2 - head.length - tail.length;
    const text = `${head}${fit(v.headline, room)}${tail}`;
    return { id: `${session.key}-${i + 1}`, verdictId: v.id, text, url, weightedLength: weighted(text) };
  });
  return { sessionKey: session.key, generatedAt: now.toISOString(), handle: HANDLE, drafts };
}

/** What to paste into X: text, blank line, link. */
export const postBody = (d: Draft) => `${d.text}\n\n${d.url}`;
