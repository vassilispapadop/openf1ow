// Homepage tile: surfaces the biggest teammate-gap mover. Picks the team
// whose gap shifted most over the last N races (rookies closing in,
// veterans pulling away). Sparkline shows the trend.

import { useEffect, useState } from "react";
import { C } from "../../lib/styles";
import { loadSeasonTrends } from "../../lib/seasonClient";
import TrendTile from "./TrendTile";
import Sparkline from "./Sparkline";

interface State {
  team: string;
  faster: string;
  slower: string;
  values: number[];
  delta: number;
  latestGap: number;
}

export default function TeammateGapTile({ year }: { year: number }) {
  const [state, setState] = useState<State | "loading" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const trends = await loadSeasonTrends(year);
      if (cancelled) return;
      const races = trends?.teammateGap ?? [];
      if (races.length < 1) { setState("empty"); return; }

      const window = races.slice(-Math.min(8, races.length));
      // Build per-team series of gaps (signed: + when same driver still faster, − when teammates flipped)
      const teamFaster: Record<string, string> = {};
      const teamSeries: Record<string, number[]> = {};
      for (const r of window) {
        for (const t of r.teams) {
          if (!teamFaster[t.team]) teamFaster[t.team] = t.faster;
          const sign = t.faster === teamFaster[t.team] ? 1 : -1;
          (teamSeries[t.team] ||= []).push(sign * t.gap);
        }
      }

      // Find the team with the biggest absolute swing whose series spans
      // at least 2 races. Falls back to the team with the largest single-
      // race gap when the season is too young for a real trend.
      let bestTeam: string | null = null;
      let bestDelta = 0;
      for (const [team, vals] of Object.entries(teamSeries)) {
        if (vals.length < 2) continue;
        const d = vals[vals.length - 1] - vals[0];
        if (Math.abs(d) > Math.abs(bestDelta)) {
          bestDelta = d;
          bestTeam = team;
        }
      }
      if (!bestTeam) {
        // Single-race fallback: surface whichever team had the biggest
        // outright gap so the tile still has signal.
        const single = window[window.length - 1].teams[0];
        if (!single) { setState("empty"); return; }
        bestTeam = single.team;
        bestDelta = 0;
      }

      const values = teamSeries[bestTeam];
      const latestRace = window[window.length - 1].teams.find(t => t.team === bestTeam);
      if (!latestRace || !values?.length) { setState("empty"); return; }

      setState({
        team: bestTeam,
        faster: latestRace.faster,
        slower: latestRace.slower,
        values,
        delta: bestDelta,
        latestGap: latestRace.gap,
      });
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (state === "loading") {
    return <TrendTile label="TEAMMATE GAP" headline="—" detail="loading…" />;
  }
  if (state === "empty") {
    return (
      <TrendTile
        label="TEAMMATE GAP"
        headline="No trend yet"
        detail="Waiting for races with comparable laps"
      />
    );
  }

  const closing = state.delta < 0;
  const showTrend = state.values.length >= 2;
  const arrow = !showTrend ? "" : closing ? "↘" : state.delta > 0 ? "↗" : "→";
  const deltaText = showTrend
    ? `${state.delta >= 0 ? "+" : ""}${state.delta.toFixed(3)}s ${arrow} over ${state.values.length} races`
    : "biggest gap so far";

  return (
    <TrendTile
      label="TEAMMATE GAP"
      headline={`${state.team} ${arrow}`.trim()}
      detail={`${state.faster} ${state.latestGap.toFixed(3)}s ahead of ${state.slower}`}
      delta={{ value: deltaText, positive: closing }}
      spark={
        showTrend ? (
          <Sparkline
            values={state.values}
            stroke={closing ? C.violet : C.warn}
            fill={closing ? "rgba(167,139,250,0.08)" : "rgba(255,181,71,0.08)"}
            invert
          />
        ) : undefined
      }
      href={`/${year}/trends`}
    />
  );
}
