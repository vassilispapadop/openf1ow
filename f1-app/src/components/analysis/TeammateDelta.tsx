import React, { useMemo } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, rowBg } from "../../lib/format";

function TeammateDelta({ allLaps, drivers }: {
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const teamPairs = useMemo(() => {
    // Group drivers by team
    const teams: Record<string, Driver[]> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!teams[t]) teams[t] = [];
      teams[t].push(d);
    });

    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return Object.entries(teams)
      .filter(([_, ds]) => ds.length >= 2)
      .map(([team, ds]) => {
        // Take first two drivers per team
        const [d1, d2] = ds.slice(0, 2);
        const laps1 = (lapMap[d1.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);
        const laps2 = (lapMap[d2.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);

        // Find common laps (both drivers have data)
        const l1Map: Record<number, number> = {};
        laps1.forEach(l => { l1Map[l.lap_number] = l.lap_duration!; });
        const commonLaps: { lap: number; t1: number; t2: number }[] = [];
        laps2.forEach(l => {
          if (l1Map[l.lap_number]) {
            commonLaps.push({ lap: l.lap_number, t1: l1Map[l.lap_number], t2: l.lap_duration! });
          }
        });

        if (!commonLaps.length) return null;

        const avg1 = commonLaps.reduce((s, c) => s + c.t1, 0) / commonLaps.length;
        const avg2 = commonLaps.reduce((s, c) => s + c.t2, 0) / commonLaps.length;

        // Determine who is faster by average, then show gap as positive
        const d1Faster = avg1 <= avg2;
        const faster = d1Faster ? d1 : d2;
        const slower = d1Faster ? d2 : d1;
        const fasterAvg = d1Faster ? avg1 : avg2;
        const slowerAvg = d1Faster ? avg2 : avg1;
        const gap = slowerAvg - fasterAvg; // always positive

        return {
          team,
          faster, slower,
          commonLaps: commonLaps.length,
          gap,
          fasterAvg, slowerAvg,
          color: d1.team_colour || "666",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.gap - b!.gap) as NonNullable<typeof teamPairs[number]>[];
  }, [allLaps, drivers]);

  if (!teamPairs.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>Need 2+ drivers per team</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
      {teamPairs.map(tp => (
          <div key={tp.team} style={{
            ...sty.card,
            borderTop: "3px solid #" + tp.color,
            marginBottom: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#" + tp.color, marginBottom: 10, letterSpacing: "0.5px" }}>
              {tp.team}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontFamily: F,
                  color: "#22c55e",
                }}>{tp.faster.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.fasterAvg)}</div>
                <div style={{ fontSize: 9, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>FASTER</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 12px" }}>
                <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 2 }}>GAP</div>
                <div style={{
                  fontSize: 18, fontWeight: 800, fontFamily: M,
                  color: tp.gap < 0.1 ? "#b0b0c0" : "#e10600",
                }}>+{tp.gap.toFixed(3)}s</div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: F }}>{tp.slower.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.slowerAvg)}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", textAlign: "center" }}>
              {tp.commonLaps} comparable laps
            </div>
          </div>
      ))}
    </div>
  );
}

export default TeammateDelta;
