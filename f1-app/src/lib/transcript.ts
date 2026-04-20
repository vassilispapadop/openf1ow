export interface TranscriptSegment {
  segment: number;
  text: string;
  visual: "lap_chart" | "gap_chart" | "pit_stops" | "sector_times" | "standings" | "tyre_strategy";
  data_focus: { lap?: number; driver?: string; team?: string };
  est_timestamp: number;
  timestamp?: number;
  duration?: number;
}

const VALID_VISUALS = new Set(["lap_chart", "gap_chart", "pit_stops", "sector_times", "standings", "tyre_strategy"]);

export function parseTranscript(raw: string | unknown[]): TranscriptSegment[] {
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      const first = cleaned.indexOf("\n");
      cleaned = cleaned.slice(first + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();
    }
    arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw new Error("Transcript must be a JSON array");
  }

  return arr.map((s, i) => {
    const seg = s as Record<string, unknown>;
    return {
    segment: (seg.segment as number) ?? i + 1,
    text: String(seg.text || ""),
    visual: VALID_VISUALS.has(seg.visual as string) ? seg.visual as TranscriptSegment["visual"] : "standings",
    data_focus: (seg.data_focus || {}) as TranscriptSegment["data_focus"],
    est_timestamp: Number(seg.est_timestamp) || 0,
    timestamp: seg.timestamp != null ? Number(seg.timestamp) : undefined,
    duration: seg.duration != null ? Number(seg.duration) : undefined,
  };
  });
}
