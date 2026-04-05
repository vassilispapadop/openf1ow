import React, { useMemo, useRef } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import BoxPlotChart, { teamAbbr } from "./BoxPlotChart";
import ShareButton from "../ShareButton";

function ConstructorPace({ allLaps, drivers, viewMode }: {
  viewMode: "list" | "graph";
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const teams = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const teamMap: Record<string, { drivers: Driver[]; color: string }> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!teamMap[t]) teamMap[t] = { drivers: [], color: d.team_colour || "666" };
      teamMap[t].drivers.push(d);
    });

    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return Object.entries(teamMap).map(([team, { drivers: tDrivers, color }]) => {
      // Collect all clean laps for the team
      const allClean: number[] = [];
      const driverStats = tDrivers.map(d => {
        const clean = (lapMap[d.driver_number] || [])
          .filter(l => isCleanLap(l, threshold))
          .map(l => l.lap_duration!);
        allClean.push(...clean);

        if (clean.length < 3) return null;
        const avg = median(clean);
        const best = Math.min(...clean);
        return { driver: d, avg, best, laps: clean.length };
      }).filter(Boolean) as { driver: Driver; avg: number; best: number; laps: number }[];

      if (allClean.length < 5) return null;

      const teamAvg = median(allClean);
      const teamBest = Math.min(...allClean);

      return { team, color, teamAvg, teamBest, driverStats, totalLaps: allClean.length, times: allClean };
    })
    .filter(Boolean)
    .sort((a, b) => a!.teamAvg - b!.teamAvg) as NonNullable<typeof teams[number]>[];
  }, [allLaps, drivers]);

  if (!teams.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No data</div>;

  const fastest = teams[0]?.teamAvg || 0;
  const maxGap = teams.length > 1 ? teams[teams.length - 1].teamAvg - fastest : 1;

  if (viewMode === "graph") {
    return (
      <BoxPlotChart rows={teams.map(t => ({
        label: teamAbbr(t.team),
        color: t.color,
        times: t.times,
      }))} />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ShareButton domRef={contentRef} filename="openf1ow-constructors" />
      </div>
      <div ref={contentRef}>
      {teams.map((t, i) => (
        <div key={t.team} style={{
          ...sty.card,
          marginBottom: 8,
          borderLeft: "4px solid #" + t.color,
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontWeight: 800, fontSize: 18,
                color: podiumColor(i),
                fontFamily: F, minWidth: 28,
              }}>P{i + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#" + t.color, fontFamily: F }}>{t.team}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M }}>{ft3(t.teamAvg)}</div>
              <div style={{
                fontSize: 11, fontFamily: M, fontWeight: 600,
                color: i === 0 ? "#22c55e" : "#ef4444",
              }}>
                {i === 0 ? "LEADER" : "+" + (t.teamAvg - fastest).toFixed(3) + "s"}
              </div>
            </div>
          </div>
          {/* Gap bar */}
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginBottom: 10 }}>
            <div style={{
              height: 4, borderRadius: 2, background: "#" + t.color, opacity: 0.6,
              width: (i === 0 ? 100 : Math.max(5, 100 - ((t.teamAvg - fastest) / maxGap) * 80)) + "%",
            }} />
          </div>
          {/* Driver breakdown */}
          <div style={{ display: "flex", gap: 16 }}>
            {t.driverStats.map(ds => (
              <div key={ds.driver.driver_number} style={{
                flex: 1,
                background: "rgba(10,14,20,0.5)",
                borderRadius: 8,
                padding: "8px 12px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: F, marginBottom: 4 }}>
                  {ds.driver.name_acronym}
                  <span style={{ color: "#5a5a6e", fontWeight: 400, fontSize: 10, marginLeft: 6 }}>#{ds.driver.driver_number}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#b0b0c0" }}>
                  <span>Med: <span style={{ fontFamily: M, fontWeight: 600 }}>{ft3(ds.avg)}</span></span>
                  <span>Best: <span style={{ fontFamily: M, fontWeight: 600, color: "#a855f7" }}>{ft3(ds.best)}</span></span>
                  <span style={{ color: "#5a5a6e" }}>{ds.laps} laps</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

export default ConstructorPace;
