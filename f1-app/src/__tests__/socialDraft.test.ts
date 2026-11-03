import { describe, it, expect } from "vitest";
import { buildDrafts, postBody, type DraftInput } from "../server/social-draft";

const input = (verdicts: DraftInput["verdicts"]): DraftInput => ({ session: { key: 11326, name: "Race", meeting: "British Grand Prix", year: 2026 }, verdicts });
const v = (id: string, area: string, impact: number, confidence = "high", headline = `${id} headline.`, tab?: string) => ({ id, area, impact, confidence, headline, evidence: tab ? { tab } : undefined });

describe("buildDrafts", () => {
  it("takes the highest-impact verdict per area, skipping low confidence", () => {
    const set = buildDrafts(input([v("a", "pace", 90), v("b", "pace", 80), v("c", "strategy", 99, "low"), v("d", "battles", 60)]), 1289, "https://x.test");
    expect(set.drafts.map(d => d.verdictId)).toEqual(["a", "d"]);
  });
  it("links to the verdict's tab and stays within 280 weighted characters", () => {
    const long = "word ".repeat(120);
    const [d] = buildDrafts(input([v("a", "pace", 90, "high", long, "pace")]), 1289, "https://x.test").drafts;
    expect(d.url).toBe("https://x.test/2026/1289/11326/analysis/pace");
    expect(d.weightedLength).toBeLessThanOrEqual(280);
    expect(d.text.endsWith("#F1")).toBe(true);
    expect(postBody(d)).toContain(d.url);
  });
  it("returns no drafts when nothing is confident enough", () => {
    expect(buildDrafts(input([v("a", "pace", 90, "low")]), 1, "https://x.test").drafts).toEqual([]);
  });
});
