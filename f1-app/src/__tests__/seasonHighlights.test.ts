import { describe, it, expect } from "vitest";
import { seasonHighlights, paceWeekends, medianOf } from "../lib/seasonHighlights";
import type { SeasonTrends } from "../lib/seasonUtils";

// Four teams over six rounds. A leads throughout; C starts far back and closes in the last three.
const gapsByRound: Record<string, number[]> = {
  A: [0, 0, 0, 0, 0, 0],
  B: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
  C: [1.5, 1.5, 1.5, 0.9, 0.8, 0.9],
  D: [1.0, 1.0, 1.0, 1.0, 1.0, 1.9],   // collapses at the last round
};
const ref = 90;
const trends = {
  generatedAt: "", year: 2026, raceCount: 6, teammateGap: [], tireDeg: [],
  constructorPace: [0, 1, 2, 3, 4, 5].map(i => ({
    meetingKey: i, slug: "r" + i, meetingName: "Round " + (i + 1), dateStart: "", round: i + 1, fastestTeamMedian: ref,
    teams: Object.entries(gapsByRound).map(([team, g]) => ({ team, medianPace: ref + g[i], gapToFastest: g[i] * ref / 100, drivers: 2 })),
  })),
} as unknown as SeasonTrends;

describe("season highlights", () => {
  const hl = seasonHighlights(trends);
  const by = (id: string) => hl.find(h => h.id === id);

  it("percent gaps are relative to the fastest car", () => {
    const w = paceWeekends(trends, "race");
    expect(w[0].gaps.A).toBe(0);
    expect(w[0].gaps.C).toBeCloseTo(1.5, 6);
  });
  it("names the fastest car and how far clear it is", () => {
    expect(by("fastest")!.team).toBe("A");
    expect(by("fastest")!.value).toBe("+0.40% clear");
  });
  it("finds the team closing on the front, over the last three rounds", () => {
    const c = by("closing")!;
    expect(c.team).toBe("C");
    expect(c.value).toBe("▲ 0.60%");
  });
  it("flags the biggest mover at the last round, and its direction", () => {
    const m = by("mover")!;
    expect(m.team).toBe("D");
    expect(m.tone).toBe("neg");
    expect(m.value).toBe("▼ 0.90%");
  });
  it("skips cards it has no data for", () => {
    expect(by("corner")).toBeUndefined();
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(seasonHighlights({ ...trends, constructorPace: trends.constructorPace.slice(0, 2) } as SeasonTrends).find(h => h.id === "closing")).toBeUndefined();
  });
});
