// Three "interesting" cross-cutting stats from the most-recent race in the
// season-trends artifact. Builds the homepage's "second-screen worthy"
// content layer above the trend tiles — turns the page from sparse-
// dashboard into something with actual narrative beats.

import { useEffect, useState } from "react";
import { F, M, C, R } from "../../lib/styles";
import { TC } from "../../lib/constants";
import { loadSeasonTrends } from "../../lib/seasonClient";
import type { SeasonTrends } from "../../lib/seasonUtils";

interface Stat {
  label: string;
  headline: string;
  detail: string;
  accent?: string;          // hex string with # — used for the side bar
}

export default function HotStats({ year }: { year: number }) {
  const [stats, setStats] = useState<Stat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSeasonTrends(year).then(t => {
      if (cancelled) return;
      setStats(t ? buildStats(t) : []);
    });
    return () => { cancelled = true; };
  }, [year]);

  if (stats === null) return <div style={{ height: 110 }} />;
  if (stats.length === 0) return null;

  return (
    <section style={{ marginTop: 14 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 8,
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: "14px 16px",
            background: C.surface,
            border: "1px solid " + C.border,
            borderLeft: "3px solid " + (s.accent || C.accent),
            borderRadius: R.md,
            fontFamily: F,
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMute,
              letterSpacing: "0.12em",
              marginBottom: 6,
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}>
              {s.headline}
            </div>
            <div style={{
              fontSize: 11,
              color: C.textDim,
              marginTop: 4,
              fontFamily: M,
              fontVariantNumeric: "tabular-nums",
            }}>
              {s.detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildStats(t: SeasonTrends): Stat[] {
  const out: Stat[] = [];
  const latestTeammate = t.teammateGap[t.teammateGap.length - 1];
  const latestDeg = t.tireDeg[t.tireDeg.length - 1];

  // 1) Fastest car of the SEASON — average gap-to-leader across all races
  //    where each team appeared. Latest-race-only would crown the team that
  //    happened to have a fast Sunday, missing the through-line story.
  if (t.constructorPace.length > 0) {
    const teamGaps: Record<string, number[]> = {};
    for (const race of t.constructorPace) {
      for (const tm of race.teams) {
        (teamGaps[tm.team] ||= []).push(tm.gapToFastest);
      }
    }
    const minRaces = Math.max(2, Math.ceil(t.constructorPace.length / 2));
    const ranking = Object.entries(teamGaps)
      .map(([team, gaps]) => ({
        team,
        avg: gaps.reduce((s, g) => s + g, 0) / gaps.length,
        races: gaps.length,
      }))
      .filter(r => r.races >= minRaces)
      .sort((a, b) => a.avg - b.avg);
    if (ranking.length >= 2) {
      const top = ranking[0];
      const second = ranking[1];
      const lead = +(second.avg - top.avg).toFixed(3);
      out.push({
        label: "FASTEST CAR · " + t.year + " SEASON",
        headline: `${top.team}`,
        detail: `+${lead.toFixed(3)}s clear of ${second.team} · ${top.races} races`,
        accent: "#ff5a4a",
      });
    }
  }

  // 2) Tightest teammate gap, latest race — F1 fans love a peer head-to-head
  if (latestTeammate && latestTeammate.teams.length > 0) {
    // teams are sorted by gap descending; pick the smallest = last
    const tightest = latestTeammate.teams[latestTeammate.teams.length - 1];
    out.push({
      label: "CLOSEST TEAMMATES",
      headline: `${tightest.team} ${tightest.gap.toFixed(3)}s`,
      detail: `${tightest.faster} ${tightest.gap > 0 ? "ahead of" : "matched"} ${tightest.slower}`,
      accent: "#a78bfa",
    });
  }

  // 3) Best surviving tyre, latest race — strategy signal
  if (latestDeg && latestDeg.compounds.length > 0) {
    const sorted = [...latestDeg.compounds].sort((a, b) => a.medianDeg - b.medianDeg);
    const best = sorted[0];
    out.push({
      label: "BEST TYRE",
      headline: `${best.compound}  ${best.medianDeg.toFixed(3)}s/lap`,
      detail: `lowest fuel-corrected deg · ${best.stints} stints`,
      accent: TC[best.compound] || "#ffd700",
    });
  }

  return out;
}
