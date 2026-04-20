/** Tire compound colors */
export const TC: Record<string, string> = {
  SOFT: "#FF3333",
  MEDIUM: "#FFD700",
  HARD: "#FFFFFF",
  INTERMEDIATE: "#39B54A",
  WET: "#0072C6",
};

/** DRS status values that indicate the flap is open */
export const DRS_OPEN = [10, 12, 14];

/** DRS status value indicating eligibility (within 1s) */
export const DRS_ELIGIBLE = 8;

/** Color palette for multi-driver overlays */
export const DRIVER_COLORS = [
  "e10600", "0072C6", "FFD700", "39B54A", "FF6B35",
  "a855f7", "06b6d4", "f43f5e", "84cc16", "f97316",
  "6366f1", "ec4899", "14b8a6", "eab308", "8b5cf6",
  "22c55e", "3b82f6", "ef4444", "64748b", "d946ef",
];

export const DEFAULT_YEAR = 2026;
export const DEFAULT_ANALYSIS_TAB = "overview";
export const DEFAULT_DRIVER_TAB = "laps";

// Legacy tab slug → new view. Old URLs keep working.
export const TAB_REDIRECT: Record<string, string> = {
  ai: "overview",
  commentary: "overview",
  sectors: "pace",
  evolution: "pace",
  degradation: "strategy",
  fuel: "strategy",
  pitstops: "strategy",
  teammates: "battles",
  constructors: "battles",
  dirtyair: "battles",
  weather: "track",
  clipping: "track",
  replay: "track",
};

export const paths = {
  home: () => "/",
  meeting: (year: number, mk: string) => `/${year}/${mk}`,
  analysis: (year: number, mk: string, sk: string, subTab = DEFAULT_ANALYSIS_TAB) =>
    `/${year}/${mk}/${sk}/analysis/${subTab}`,
  driver: (year: number, mk: string, sk: string, dn: string, tab = DEFAULT_DRIVER_TAB) =>
    `/${year}/${mk}/${sk}/driver/${dn}/${tab}`,
};
