import { useEffect, useState } from "react";
import { C } from "../../lib/styles";
import { loadSeasonTrends } from "../../lib/seasonClient";
import TrendTile from "./TrendTile";
import Sparkline from "./Sparkline";

interface State {
  team: string;
  values: number[];          // gap-to-fastest, last N races
  delta: number;             // change vs. start of window
  latestGap: number;
}

export default function ConstructorPaceTile({ year }: { year: number }) {
  const [state, setState] = useState<State | "loading" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const trends = await loadSeasonTrends(year);
      if (cancelled) return;
      const races = trends?.constructorPace ?? [];
      if (races.length < 1) { setState("empty"); return; }

      const latest = races[races.length - 1];
      const window = races.slice(-Math.min(8, races.length));

      // Among the top-5 chasers in the latest race, prefer whichever team
      // has the most data points across the window — keeps the tile useful
      // even when sprint weekends or rate-limit gaps drop a team from a
      // race. Falls back to plain P2 if everyone has identical coverage.
      const candidates = latest.teams.filter(t => t.gapToFastest > 0).slice(0, 5);
      if (candidates.length === 0) { setState("empty"); return; }

      let chosen: { team: string; values: number[] } | null = null;
      for (const c of candidates) {
        const values: number[] = [];
        for (const r of window) {
          const row = r.teams.find(t => t.team === c.team);
          if (row) values.push(row.gapToFastest);
        }
        if (!chosen || values.length > chosen.values.length) {
          chosen = { team: c.team, values };
        }
      }
      if (!chosen || chosen.values.length === 0) { setState("empty"); return; }

      setState({
        team: chosen.team,
        values: chosen.values,
        delta: chosen.values.length >= 2
          ? chosen.values[chosen.values.length - 1] - chosen.values[0]
          : 0,
        latestGap: chosen.values[chosen.values.length - 1],
      });
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (state === "loading") {
    return <TrendTile label="CONSTRUCTOR PACE" headline="—" detail="loading…" />;
  }
  if (state === "empty") {
    return (
      <TrendTile
        label="CONSTRUCTOR PACE"
        headline="No trend yet"
        detail={`Run npm run trends after ${year} races complete`}
      />
    );
  }

  const closing = state.delta < 0;            // smaller gap = closing
  const showTrend = state.values.length >= 2;
  const arrow = !showTrend ? "" : closing ? "↘" : state.delta > 0 ? "↗" : "→";
  const deltaText = showTrend
    ? `${state.delta >= 0 ? "+" : ""}${state.delta.toFixed(3)}s ${arrow} over ${state.values.length} races`
    : "single race so far";

  return (
    <TrendTile
      label="CONSTRUCTOR PACE"
      headline={`${state.team} ${arrow} +${state.latestGap.toFixed(3)}s`.trim()}
      detail={`vs. fastest team${showTrend ? `, last ${state.values.length} races` : ""}`}
      delta={{ value: deltaText, positive: closing }}
      spark={
        showTrend ? (
          <Sparkline
            values={state.values}
            stroke={closing ? C.pos : C.warn}
            fill={closing ? "rgba(46,213,115,0.08)" : "rgba(255,181,71,0.08)"}
            invert      // smaller gap on top
          />
        ) : undefined
      }
      href={`/${year}/trends`}
    />
  );
}
