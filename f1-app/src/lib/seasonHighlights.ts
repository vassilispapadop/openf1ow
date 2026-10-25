// Headline numbers for the top of the season trends page, and the per-weekend
// percentage gaps that the "pace vs season average" plot shares. Pure
// functions over the precomputed SeasonTrends artifact.

import type { SeasonTrends, CornerStraightRace } from "./seasonUtils";

export type PaceMetric = "race" | "quali";

export interface Weekend { round: number; meetingName: string; gaps: Record<string, number> }

export function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Each team's gap to the fastest car at every weekend, as a % of that car's lap time. */
export function paceWeekends(trends: SeasonTrends, metric: PaceMetric): Weekend[] {
  if (metric === "race") {
    return trends.constructorPace.map(r => ({
      round: r.round,
      meetingName: r.meetingName,
      gaps: Object.fromEntries(r.teams.map(t => [t.team, (t.gapToFastest / r.fastestTeamMedian) * 100])),
    }));
  }
  return (trends.constructorQualifying ?? []).map(r => ({
    round: r.round,
    meetingName: r.meetingName,
    gaps: Object.fromEntries(r.teams.map(t => [t.team, (t.gapToFastest / r.fastestTeamBest) * 100])),
  }));
}

export interface Highlight {
  id: string;
  label: string;
  team: string;
  value: string;
  caption: string;
  /** In-page anchor of the chart that backs the number. Section ids are stable. */
  href: string;
  tone?: "pos" | "neg";
}

const pct = (v: number, dp = 2) => v.toFixed(dp) + "%";

/** How many of the latest rounds count as "recent" for the form card. */
const RECENT = 3;
const MIN_ROUNDS_FOR_FORM = RECENT + 2;

function sectionGapPct(r: CornerStraightRace, team: string, kind: "corner" | "straight"): number | null {
  const t = r.teams.find(x => x.team === team);
  const ref = r.teams.find(x => x.team === r.referenceTeam);
  if (!t || !ref) return null;
  const base = kind === "corner" ? ref.cornerTime : ref.straightTime;
  const gap = kind === "corner" ? t.cornerGap : t.straightGap;
  return base > 0 ? (gap / base) * 100 : null;
}

export function seasonHighlights(trends: SeasonTrends): Highlight[] {
  const out: Highlight[] = [];
  const race = paceWeekends(trends, "race").sort((a, b) => a.round - b.round);

  // Fastest race car over the season: lowest median gap.
  if (race.length) {
    const teams = new Set(race.flatMap(w => Object.keys(w.gaps)));
    const rows = [...teams].map(team => {
      const g = race.map(w => w.gaps[team]).filter((v): v is number => v != null);
      return { team, med: medianOf(g), n: g.length };
    }).filter(r => r.n >= Math.min(3, race.length)).sort((a, b) => a.med - b.med);
    if (rows[0]) {
      const second = rows[1];
      out.push({
        id: "fastest", label: "Fastest race car", team: rows[0].team,
        value: second ? "+" + pct(second.med - rows[0].med) + " clear" : "—",
        caption: second ? `median race pace over ${rows[0].n} rounds, ahead of ${second.team}` : `median race pace over ${rows[0].n} rounds`,
        href: "#constructor-pace", tone: "pos",
      });
    }
  }

  // Closing fastest: biggest drop in gap, last RECENT rounds against the ones before.
  if (race.length >= MIN_ROUNDS_FOR_FORM) {
    const recent = race.slice(-RECENT), earlier = race.slice(0, -RECENT);
    const teams = new Set(recent.flatMap(w => Object.keys(w.gaps)));
    const rows = [...teams].map(team => {
      const r = recent.map(w => w.gaps[team]).filter((v): v is number => v != null);
      const e = earlier.map(w => w.gaps[team]).filter((v): v is number => v != null);
      return r.length && e.length >= 2 ? { team, delta: medianOf(e) - medianOf(r) } : null;
    }).filter((x): x is { team: string; delta: number } => !!x);
    const best = rows.sort((a, b) => b.delta - a.delta)[0];
    if (best && best.delta > 0.05) {
      out.push({
        id: "closing", label: "Closing fastest", team: best.team,
        value: "▲ " + pct(best.delta),
        caption: `closer to the front over the last ${RECENT} rounds than before`,
        href: "#constructor-pace", tone: "pos",
      });
    }
  }

  // Biggest mover at the latest round against the team's usual.
  if (race.length >= 3) {
    const last = race[race.length - 1], others = race.slice(0, -1);
    const rows = Object.entries(last.gaps).map(([team, now]) => {
      const h = others.map(w => w.gaps[team]).filter((v): v is number => v != null);
      return h.length >= 2 ? { team, delta: medianOf(h) - now } : null;
    }).filter((x): x is { team: string; delta: number } => !!x);
    const mover = rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (mover && Math.abs(mover.delta) >= 0.1) {
      out.push({
        id: "mover", label: "Biggest mover", team: mover.team,
        value: (mover.delta > 0 ? "▲ " : "▼ ") + pct(Math.abs(mover.delta)),
        caption: `${last.meetingName}, against its usual race pace`,
        href: "#team-form-vs-season", tone: mover.delta > 0 ? "pos" : "neg",
      });
    }
  }

  // Corners and straights: median % gap across qualifying weekends.
  const cs = [...(trends.cornerStraight ?? [])].sort((a, b) => a.round - b.round);
  for (const kind of ["corner", "straight"] as const) {
    if (cs.length < 2) break;
    const teams = new Set(cs.flatMap(r => r.teams.map(t => t.team)));
    const rows = [...teams].map(team => {
      const g = cs.map(r => sectionGapPct(r, team, kind)).filter((v): v is number => v != null);
      return { team, med: medianOf(g), n: g.length };
    }).filter(r => r.n >= Math.min(3, cs.length)).sort((a, b) => a.med - b.med);
    if (rows[0]) {
      out.push({
        id: kind, label: kind === "corner" ? "Corner king" : "Straight-line king", team: rows[0].team,
        value: Math.abs(rows[0].med) < 0.005 ? pct(0) : (rows[0].med < 0 ? "−" : "+") + pct(Math.abs(rows[0].med)),
        caption: `median ${kind === "corner" ? "cornering" : "straight-line"} time against the weekend's fastest car, ${rows[0].n} qualifyings`,
        href: "#corner-straight-balance", tone: "pos",
      });
    }
  }
  return out;
}
