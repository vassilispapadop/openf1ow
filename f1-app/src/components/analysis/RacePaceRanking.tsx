import { useMemo, useRef } from "react";
import type { Driver, Lap } from "../../lib/types";
import { sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, paceByDriver } from "../../lib/raceUtils";
import BoxPlotChart from "./BoxPlotChart";
import ShareButton from "../ShareButton";

function RacePaceRanking({ allLaps, drivers, viewMode }: {
  allLaps: Lap[];
  drivers: Driver[];
  viewMode: "list" | "graph";
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const rankings = useMemo(() => {
    const paces = paceByDriver(allLaps, drivers).sort((a, b) => a.medianPace - b.medianPace);

    // Box plot still wants the full sorted-times array — derive once per driver.
    const threshold = computeSlowLapThreshold(allLaps);
    const timesByDriver: Record<number, number[]> = {};
    if (isFinite(threshold)) {
      for (const l of allLaps) {
        if (!isCleanLap(l, threshold)) continue;
        (timesByDriver[l.driver_number] ||= []).push(l.lap_duration!);
      }
      for (const k of Object.keys(timesByDriver)) {
        timesByDriver[+k].sort((a, b) => a - b);
      }
    }

    return paces.map(p => ({
      driver: p.driver,
      med: p.medianPace,
      best: p.bestLap,
      totalLaps: p.cleanLapCount,
      consistency: p.consistency,
      color: p.driver.team_colour || "666",
      times: timesByDriver[p.driver.driver_number] || [],
    }));
  }, [allLaps, drivers]);

  if (!rankings.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No data</div>;

  const fastest = rankings[0]?.med || 0;
  // Consistency colour scale: most consistent driver = bright green, least
  // consistent = red. Linear interpolation between the field's min and max σ.
  const sortedSigma = rankings.map(r => r.consistency).sort((a, b) => a - b);
  const minSigma = sortedSigma[0] ?? 0;
  const maxSigma = sortedSigma[sortedSigma.length - 1] ?? 1;
  const sigmaColor = (s: number): string => {
    if (maxSigma === minSigma) return "#9ca3af";
    const t = (s - minSigma) / (maxSigma - minSigma); // 0 = best, 1 = worst
    if (t < 0.33) return "#22c55e";
    if (t < 0.66) return "#a3a3a3";
    return "#ef4444";
  };

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
              {["#", "Driver", "Team", "Median Pace", "Best", "Gap", "Cons. σ", "Laps"].map((h, i) => (
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
                <td style={{
                  ...sty.td, ...sty.mono, textAlign: "right",
                  color: sigmaColor(r.consistency),
                  fontWeight: 600,
                }} title={`Standard deviation of ${r.totalLaps} clean laps — lower is more consistent`}>
                  {r.consistency.toFixed(3)}s
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
