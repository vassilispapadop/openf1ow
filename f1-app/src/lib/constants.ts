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

/** The three ways a stretch of track is classified, shared by every view that
 *  draws them so the colours and wording never drift apart. Corner = limited by
 *  cornering grip. Curve = the track turns but a modern car carries it at or
 *  near full throttle, so drag and power decide it. Straight = not turning. */
export const SECTION_COLORS = {
  corner: "#ffb547",
  curve: "#38bdf8",
  straight: "#a78bfa",
} as const;

export const SECTION_LABELS = {
  corner: "Corners",
  curve: "Fast curves",
  straight: "Straights",
} as const;

/** Singular, for prose. */
export const SECTION_LABEL_ONE = {
  corner: "corner",
  curve: "fast curve",
  straight: "straight",
} as const;

/** Team liveries, used anywhere a chart colours a series by constructor.
 *  Covers the 2026 grid (Audi and Cadillac in, Kick Sauber out) alongside the
 *  historical names, since the season pages render past years too. */
export const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#1E5BC6",
  "McLaren": "#FF8000",
  "Ferrari": "#DC0000",
  "Mercedes": "#27F4D2",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Williams": "#64C4FF",
  "RB": "#6692FF",
  "Racing Bulls": "#6692FF",
  "Kick Sauber": "#52E252",
  "Haas F1 Team": "#B6BABD",
  "AlphaTauri": "#5E8FAA",
  "Alfa Romeo": "#900000",
  "Audi": "#E1224B",
  "Cadillac": "#F8C545",
};

/** Used when a team isn't in TEAM_COLORS — index into it by series order. */
export const TEAM_FALLBACK_COLORS = ["#a78bfa", "#06b6d4", "#f43f5e", "#84cc16", "#f97316", "#6366f1", "#ec4899"];

/** Color palette for multi-driver overlays */
export const DRIVER_COLORS = [
  "e10600", "0072C6", "FFD700", "39B54A", "FF6B35",
  "a855f7", "06b6d4", "f43f5e", "84cc16", "f97316",
  "6366f1", "ec4899", "14b8a6", "eab308", "8b5cf6",
  "22c55e", "3b82f6", "ef4444", "64748b", "d946ef",
];

export const DEFAULT_YEAR = 2026;
export const DEFAULT_DRIVER_TAB = "laps";

export const ANALYSIS_VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "pace", label: "Pace" },
  { key: "strategy", label: "Strategy" },
  { key: "battles", label: "Battles" },
  { key: "track", label: "Track" },
] as const;

export type ViewKey = typeof ANALYSIS_VIEWS[number]["key"];

export const DEFAULT_ANALYSIS_TAB: ViewKey = ANALYSIS_VIEWS[0].key;

// Legacy tab slug → new view. Old URLs keep working.
export const TAB_REDIRECT: Record<string, ViewKey> = {
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
