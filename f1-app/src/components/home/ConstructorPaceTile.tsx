// Homepage tile: "Who's the second-fastest car right now, and is the gap
// growing or shrinking?" Reads season-trends artifact, picks the team
// that's currently P2 in median pace at the most recent race, plots its
// gap-to-fastest across the last few races.

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
      if (races.length < 2) { setState("empty"); return; }

      // Take the last race; pick its P2 team. Then trace that team's gap
      // across all races where it appeared.
      const latest = races[races.length - 1];
      const p2 = latest.teams.find(t => t.gapToFastest > 0);
      if (!p2) { setState("empty"); return; }

      const window = races.slice(-Math.min(8, races.length));
      const values: number[] = [];
      for (const r of window) {
        const row = r.teams.find(t => t.team === p2.team);
        if (row) values.push(row.gapToFastest);
      }
      if (values.length < 2) { setState("empty"); return; }

      setState({
        team: p2.team,
        values,
        delta: values[values.length - 1] - values[0],
        latestGap: values[values.length - 1],
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
  const arrow = closing ? "↘" : state.delta > 0 ? "↗" : "→";
  const deltaText = `${state.delta >= 0 ? "+" : ""}${state.delta.toFixed(3)}s ${arrow} over ${state.values.length} races`;

  return (
    <TrendTile
      label="CONSTRUCTOR PACE"
      headline={`${state.team} ${arrow} +${state.latestGap.toFixed(3)}s`}
      detail={`vs. fastest team, last ${state.values.length} races`}
      delta={{ value: deltaText, positive: closing }}
      spark={
        <Sparkline
          values={state.values}
          stroke={closing ? C.pos : C.warn}
          fill={closing ? "rgba(46,213,115,0.08)" : "rgba(255,181,71,0.08)"}
          invert      // smaller gap on top
        />
      }
      href={`/${year}/trends`}
    />
  );
}
