import React, { useMemo } from "react";
import type { Driver, Pit } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { rowBg, podiumColor } from "../../lib/format";

function PitStopRanking({ pits, drivers }: {
  pits: Pit[];
  drivers: Driver[];
}) {
  const teamPits = useMemo(() => {
    const drvMap: Record<number, Driver> = {};
    drivers.forEach(d => { drvMap[d.driver_number] = d; });

    const byTeam: Record<string, { stops: Pit[]; color: string }> = {};
    pits.forEach(p => {
      const d = drvMap[p.driver_number];
      if (!d) return;
      const team = d.team_name || "Unknown";
      if (!byTeam[team]) byTeam[team] = { stops: [], color: d.team_colour || "666" };
      byTeam[team].stops.push(p);
    });

    return Object.entries(byTeam).map(([team, { stops, color }]) => {
      const durations = stops
        .map(s => s.pit_duration || s.lane_duration || s.stop_duration)
        .filter(Boolean) as number[];
      if (!durations.length) return null;
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      const best = Math.min(...durations);
      const worst = Math.max(...durations);
      return { team, color, count: stops.length, avg, best, worst, stops };
    })
    .filter(Boolean)
    .sort((a, b) => a!.avg - b!.avg) as NonNullable<typeof teamPits[number]>[];
  }, [pits, drivers]);

  if (!teamPits.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No pit stop data</div>;

  const fastest = teamPits[0]?.avg || 0;

  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["#", "Team", "Stops", "Avg", "Best", "Worst", "vs Best"].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: i <= 1 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamPits.map((t, i) => (
            <tr key={t.team} style={rowBg(i)}>
              <td style={{
                ...sty.td, fontWeight: 800, fontSize: 14,
                color: podiumColor(i),
              }}>{i + 1}</td>
              <td style={{
                ...sty.td,
                borderLeft: "3px solid #" + t.color,
                paddingLeft: 12,
                fontWeight: 600,
              }}>{t.team}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{t.count}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{t.avg.toFixed(2)}s</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#22c55e" }}>{t.best.toFixed(2)}s</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#ef4444" }}>{t.worst.toFixed(2)}s</td>
              <td style={{
                ...sty.td, ...sty.mono, textAlign: "right",
                color: i === 0 ? "#22c55e" : "#fbbf24",
                fontWeight: 600,
              }}>
                {i === 0 ? "—" : "+" + (t.avg - fastest).toFixed(2) + "s"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PitStopRanking;
