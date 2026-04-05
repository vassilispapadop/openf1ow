import React, { useMemo, useRef } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import BoxPlotChart from "./BoxPlotChart";
import ShareButton from "../ShareButton";

function RacePaceRanking({ allLaps, drivers, viewMode }: {
  allLaps: Lap[];
  drivers: Driver[];
  viewMode: "list" | "graph";
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const rankings = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return drivers.map(d => {
      const cleanLaps = (lapMap[d.driver_number] || [])
        .filter(l => isCleanLap(l, threshold));
      if (cleanLaps.length < 3) return null;

      const times = cleanLaps.map(l => l.lap_duration!).sort((a, b) => a - b);
      const med = median(times);
      const best = times[0];
      const totalLaps = cleanLaps.length;

      return { driver: d, med, best, totalLaps, color: d.team_colour || "666", times };
    })
    .filter(Boolean)
    .sort((a, b) => a!.med - b!.med) as NonNullable<typeof rankings[number]>[];
  }, [allLaps, drivers]);

  if (!rankings.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No data</div>;

  const fastest = rankings[0]?.med || 0;

  if (viewMode === "graph") {
    return (
      <BoxPlotChart rows={rankings.map(r => ({
        label: r.driver.name_acronym,
        color: r.color,
        times: r.times,
      }))} />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ShareButton domRef={contentRef} filename="openf1ow-race-pace" />
      </div>
      <div ref={contentRef}>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["#", "Driver", "Team", "Median Pace", "Best", "Gap", "Laps"].map((h, i) => (
                <th key={i} style={{ ...sty.th, textAlign: i <= 2 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, i) => (
              <tr key={r.driver.driver_number} style={rowBg(i)}>
                <td style={{
                  ...sty.td, fontWeight: 800, fontSize: 14,
                  color: podiumColor(i),
                }}>{i + 1}</td>
                <td style={{
                  ...sty.td,
                  borderLeft: "3px solid #" + r.color,
                  paddingLeft: 12,
                  fontWeight: 600,
                }}>
                  <span style={{ color: "#5a5a6e", marginRight: 6, fontSize: 11 }}>#{r.driver.driver_number}</span>
                  {r.driver.full_name}
                </td>
                <td style={{ ...sty.td, color: "#" + r.color, fontSize: 11, fontWeight: 600 }}>{r.driver.team_name}</td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{ft3(r.med)}</td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#a855f7" }}>{ft3(r.best)}</td>
                <td style={{
                  ...sty.td, ...sty.mono, textAlign: "right",
                  color: i === 0 ? "#22c55e" : "#ef4444",
                  fontWeight: 600,
                }}>
                  {i === 0 ? "—" : "+" + (r.med - fastest).toFixed(3) + "s"}
                </td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e" }}>{r.totalLaps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

export default RacePaceRanking;
