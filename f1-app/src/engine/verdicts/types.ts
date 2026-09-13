import type { Confidence } from "../types/gated.ts";

export type VerdictArea = "overview" | "pace" | "strategy" | "battles" | "track";

export interface VerdictNumber { label: string; value: string }

export interface Verdict {
  id: string;                     // rule id, stable
  area: VerdictArea;              // the tab that holds the evidence
  headline: string;               // one sentence, the finding
  detail: string;                 // one or two sentences, the how and the caveat
  confidence: Confidence;
  numbers: VerdictNumber[];       // the figures behind it
  evidence: { tab: VerdictArea; sectionId: string; drivers?: number[] };
  impact: number;                 // for ordering; larger = more important
  drivers?: number[];             // drivers named
  /** When set, the verdict also renders as a headline tile at the top of the page. */
  kpi?: { label: string; value: string; sub?: string; accent?: "gold" | "violet" | "pos" | "warn" | "accent" };
}
