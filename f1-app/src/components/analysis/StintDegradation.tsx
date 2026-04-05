import React, { useState, useMemo, useRef } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, ft1, podiumColor, rowBg } from "../../lib/format";
import { TC } from "../../lib/constants";
import { computeSlowLapThreshold, isCleanLap, median, linearSlope, FUEL_TOTAL_KG, FUEL_SEC_PER_KG } from "../../lib/raceUtils";
import BoxPlotChart from "./BoxPlotChart";
import ShareButton from "../ShareButton";

interface StintRow {
  driver: Driver;
  stint: Stint;
  stintLaps: number;
  avgPace: number;
  bestLap: number;
  degradation: number;
  rawDegradation: number;
  firstLap: number;
  lastLap: number;
  times: number[];
}

interface OverallRow {
  driver: Driver;
  avgDeg: number;
  rawAvgDeg: number;
  stintCount: number;
  totalLaps: number;
  compounds: string[];
}

function StintDegradation({ allLaps, drivers, stints, viewMode }: {
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  viewMode: "list" | "graph";
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [compoundFilter, setCompoundFilter] = useState("OVERALL");

  const { data, fuelCorrectionPerLap, compounds } = useMemo(() => {
    const lapMap: Record<string, Lap> = {};
    allLaps.forEach(l => { lapMap[l.driver_number + "-" + l.lap_number] = l; });

    const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
    const fuelPerLap = FUEL_TOTAL_KG / totalRaceLaps;
    const fuelCorrectionPerLap = fuelPerLap * FUEL_SEC_PER_KG;
    const threshold = computeSlowLapThreshold(allLaps);

    const compoundSet = new Set<string>();

    const results: StintRow[] = stints.map(st => {
      const drv = drivers.find(d => d.driver_number === st.driver_number);
      if (!drv) return null;

      compoundSet.add(st.compound);

      const allStintLaps: Lap[] = [];
      for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
        const l = lapMap[st.driver_number + "-" + ln];
        if (l && isCleanLap(l, threshold)) {
          allStintLaps.push(l);
        }
      }
      const stintLaps = allStintLaps.slice(2);
      if (stintLaps.length < 3) return null;

      const xs = stintLaps.map((_, i) => i);
      const fuelCorrectedYs = stintLaps.map(l =>
        l.lap_duration! + (l.lap_number - 1) * fuelCorrectionPerLap
      );
      const rawYs = stintLaps.map(l => l.lap_duration!);
      const degradation = Math.max(0, linearSlope(xs, fuelCorrectedYs));
      const rawDegradation = Math.max(0, linearSlope(xs, rawYs));
      const avgPace = rawYs.reduce((s, y) => s + y, 0) / rawYs.length;

      return {
        driver: drv,
        stint: st,
        stintLaps: allStintLaps.length,
        avgPace,
        bestLap: Math.min(...rawYs),
        degradation,
        rawDegradation,
        firstLap: rawYs[0],
        lastLap: rawYs[rawYs.length - 1],
        times: rawYs,
      };
    }).filter(Boolean) as StintRow[];

    const compoundOrder = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
    const compounds = [...compoundSet].sort((a, b) => compoundOrder.indexOf(a) - compoundOrder.indexOf(b));

    return { data: results, fuelCorrectionPerLap, compounds };
  }, [allLaps, drivers, stints]);

  // Compute overall per-driver averages (weighted by stint laps)
  const overallData: OverallRow[] = useMemo(() => {
    const byDriver: Record<number, StintRow[]> = {};
    data.forEach(d => {
      if (!byDriver[d.driver.driver_number]) byDriver[d.driver.driver_number] = [];
      byDriver[d.driver.driver_number].push(d);
    });
    return Object.values(byDriver).map(rows => {
      const totalLaps = rows.reduce((s, r) => s + r.stintLaps, 0);
      const avgDeg = rows.reduce((s, r) => s + r.degradation * r.stintLaps, 0) / totalLaps;
      const rawAvgDeg = rows.reduce((s, r) => s + r.rawDegradation * r.stintLaps, 0) / totalLaps;
      const compoundsUsed = [...new Set(rows.map(r => r.stint.compound))];
      return {
        driver: rows[0].driver,
        avgDeg,
        rawAvgDeg,
        stintCount: rows.length,
        totalLaps,
        compounds: compoundsUsed,
      };
    }).sort((a, b) => a.avgDeg - b.avgDeg);
  }, [data]);

  if (!data.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No stint data</div>;

  const filtered = compoundFilter === "OVERALL"
    ? null
    : [...data]
        .filter(d => d.stint.compound === compoundFilter)
        .sort((a, b) => a.avgPace - b.avgPace);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ShareButton domRef={contentRef} filename="openf1ow-tire-degradation" />
      </div>
      <div ref={contentRef}>
      {/* Fuel correction info */}
      <div style={{
        background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)",
        borderRadius: 8, padding: "8px 12px", marginBottom: 12,
        fontSize: 11, color: "#f97316", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontWeight: 700 }}>FUEL CORRECTION</span>
        <span style={{ color: "#b0b0c0" }}>
          ~{(fuelCorrectionPerLap * 1000).toFixed(0)}ms/lap fuel effect applied
          ({FUEL_TOTAL_KG}kg / {FUEL_SEC_PER_KG}s per kg)
        </span>
      </div>

      {/* Compound sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setCompoundFilter("OVERALL")} style={{
          padding: "5px 14px", border: "none", cursor: "pointer",
          fontSize: 11, fontWeight: 700, fontFamily: F,
          borderRadius: 14,
          background: compoundFilter === "OVERALL" ? "rgba(255,255,255,0.15)" : "transparent",
          color: compoundFilter === "OVERALL" ? "#e8e8ec" : "#5a5a6e",
          transition: "all 0.2s ease",
        }}>OVERALL</button>
        {compounds.map(c => (
          <button key={c} onClick={() => setCompoundFilter(c)} style={{
            padding: "5px 14px", border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: 700, fontFamily: F,
            borderRadius: 14,
            background: compoundFilter === c ? (TC[c] || "#888") + "22" : "transparent",
            color: compoundFilter === c ? (TC[c] || "#e8e8ec") : "#5a5a6e",
            borderBottom: compoundFilter === c ? "2px solid " + (TC[c] || "#888") : "2px solid transparent",
            transition: "all 0.2s ease",
          }}>{c}</button>
        ))}
      </div>

      {/* GRAPH mode — box plots of lap time distributions */}
      {viewMode === "graph" && compoundFilter === "OVERALL" && overallData.length > 0 && (
        <BoxPlotChart rows={(() => {
          // Aggregate all stint times per driver
          const byDriver: Record<number, { driver: Driver; times: number[] }> = {};
          data.forEach(d => {
            if (!byDriver[d.driver.driver_number]) byDriver[d.driver.driver_number] = { driver: d.driver, times: [] };
            byDriver[d.driver.driver_number].times.push(...d.times);
          });
          return Object.values(byDriver)
            .filter(d => d.times.length >= 3)
            .map(d => ({ label: d.driver.name_acronym, color: d.driver.team_colour || "666", times: d.times }))
            .sort((a, b) => median(a.times) - median(b.times));
        })()} />
      )}
      {viewMode === "graph" && compoundFilter !== "OVERALL" && filtered && filtered.length > 0 && (
        <BoxPlotChart rows={filtered
          .filter(d => d.times.length >= 3)
          .map(d => ({
            label: d.driver.name_acronym + " L" + d.stint.lap_start + "-" + d.stint.lap_end,
            color: d.driver.team_colour || "666",
            times: d.times,
          }))} />
      )}

      {/* OVERALL view: per-driver average deg across all stints */}
      {viewMode === "list" && compoundFilter === "OVERALL" && (
        <div style={{ overflow: "auto", maxHeight: 500 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Driver", "Compounds", "Stints", "Total Laps", "Deg/Lap", "Raw"].map((h, i) => (
                  <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overallData.map((d, i) => (
                <tr key={d.driver.driver_number} style={rowBg(i)}>
                  <td style={{
                    ...sty.td,
                    borderLeft: "3px solid #" + (d.driver.team_colour || "666"),
                    paddingLeft: 12,
                    fontWeight: 600,
                  }}>
                    <span style={{ color: "#" + (d.driver.team_colour || "e8e8ec"), marginRight: 6, fontSize: 11 }}>
                      {d.driver.name_acronym}
                    </span>
                  </td>
                  <td style={{ ...sty.td, textAlign: "right" }}>
                    {d.compounds.map(c => (
                      <span key={c} style={{
                        color: TC[c] || "#888", fontWeight: 700, fontSize: 10,
                        marginLeft: 6,
                      }}>{c}</span>
                    ))}
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{d.stintCount}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{d.totalLaps}</td>
                  <td style={{
                    ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700,
                    color: d.avgDeg > 0.08 ? "#ef4444" : d.avgDeg > 0.04 ? "#fbbf24" : "#b0b0c0",
                  }}>
                    {d.avgDeg === 0 ? "~0" : "+" + (d.avgDeg * 1000).toFixed(0) + "ms"}
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontSize: 10, color: "#5a5a6e" }}>
                    {d.rawAvgDeg === 0 ? "~0" : "+" + (d.rawAvgDeg * 1000).toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-compound view: individual stints */}
      {viewMode === "list" && filtered && (
        <div style={{ overflow: "auto", maxHeight: 500 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Driver", "Stint", "Laps", "Median", "Best", "Deg/Lap", "Raw", "First", "Last"].map((h, i) => (
                  <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i} style={rowBg(i)}>
                  <td style={{
                    ...sty.td,
                    borderLeft: "3px solid #" + (d.driver.team_colour || "666"),
                    paddingLeft: 12,
                    fontWeight: 600,
                  }}>
                    <span style={{ color: "#" + (d.driver.team_colour || "e8e8ec"), marginRight: 6, fontSize: 11 }}>
                      {d.driver.name_acronym}
                    </span>
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e", fontSize: 10 }}>
                    L{d.stint.lap_start}-{d.stint.lap_end}
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{d.stintLaps}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 600 }}>{ft3(d.avgPace)}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#a855f7" }}>{ft3(d.bestLap)}</td>
                  <td style={{
                    ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700,
                    color: d.degradation > 0.08 ? "#ef4444" : d.degradation > 0.04 ? "#fbbf24" : "#b0b0c0",
                  }}>
                    {d.degradation === 0 ? "~0" : "+" + (d.degradation * 1000).toFixed(0) + "ms"}
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontSize: 10, color: "#5a5a6e" }}>
                    {d.rawDegradation === 0 ? "~0" : "+" + (d.rawDegradation * 1000).toFixed(0)}
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e", fontSize: 11 }}>{ft3(d.firstLap)}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e", fontSize: 11 }}>{ft3(d.lastLap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

export default StintDegradation;
