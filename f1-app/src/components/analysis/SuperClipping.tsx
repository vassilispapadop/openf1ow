import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { podiumColor, rowBg } from "../../lib/format";
import { api } from "../../lib/api";
import BoxPlotChart from "./BoxPlotChart";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import ScatterPlot from "./ScatterPlot";
import type { ScatterPoint } from "./useTooltip";
import ShareButton from "../ShareButton";
import { detectClipping, THROTTLE_THRESHOLD, MIN_SPEED_DROP, type ClipEvent } from "../../lib/clipping";
import { mergeDistance } from "../../lib/telemetry";

interface DriverClipResult {
  driver: Driver;
  lap: Lap;
  events: ClipEvent[];
  totalSpeedLost: number;
  avgSpeedDrop: number;
  worstDrop: number;
  clipCount: number;
}

const DEFAULT_SAMPLE_LAPS = 5;

export default function SuperClipping({ sessionKey, allLaps, drivers }: {
  sessionKey: string;
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const [results, setResults] = useState<DriverClipResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [sampleLaps, setSampleLaps] = useState(DEFAULT_SAMPLE_LAPS);
  const contentRef = useRef<HTMLDivElement>(null);

  const threshold = useMemo(() => computeSlowLapThreshold(allLaps), [allLaps]);

  const drvMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  const analyze = useCallback(async () => {
    if (!sessionKey || !allLaps.length || !drivers.length) return;
    setLoading(true);
    setResults([]);
    setProgress("Selecting laps...");

    const lapsByDriver: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapsByDriver[l.driver_number]) lapsByDriver[l.driver_number] = [];
      lapsByDriver[l.driver_number].push(l);
    });

    const allResults: DriverClipResult[] = [];
    const driverNums = Object.keys(lapsByDriver).map(Number);
    let done = 0;

    for (const dn of driverNums) {
      const drv = drvMap[dn];
      if (!drv) continue;
      const cleanLaps = lapsByDriver[dn]
        .filter(l => isCleanLap(l, threshold))
        .sort((a, b) => a.lap_duration - b.lap_duration)
        .slice(0, sampleLaps);

      if (!cleanLaps.length) continue;

      done++;
      setProgress(`Fetching telemetry (${done}/${driverNums.length} drivers)...`);

      for (const lap of cleanLaps) {
        try {
          const end = new Date(new Date(lap.date_start).getTime() + lap.lap_duration * 1000 + 2000).toISOString();
          const q = `?session_key=${sessionKey}&driver_number=${dn}&date>=${lap.date_start}&date<=${end}`;
          const [cd, loc] = await Promise.all([
            api("/car_data" + q),
            api("/location" + q).catch(() => []),
          ]);

          const telemetry = mergeDistance(cd, loc);
          const events = detectClipping(telemetry);
          if (events.length > 0) {
            const drops = events.map(e => e.speedDrop);
            allResults.push({
              driver: drv, lap, events,
              totalSpeedLost: drops.reduce((s, d) => s + d, 0),
              avgSpeedDrop: median(drops),
              worstDrop: Math.max(...drops),
              clipCount: events.length,
            });
          }
        } catch { /* skip failed laps */ }
      }
    }

    allResults.sort((a, b) => b.worstDrop - a.worstDrop);
    setResults(allResults);
    setLoading(false);
    setProgress("");
  }, [sessionKey, allLaps, drivers, drvMap, threshold, sampleLaps]);

  useEffect(() => { analyze(); }, [sessionKey, sampleLaps, allLaps, drivers]);

  // Box plot data: clipping drops per driver across all analyzed laps
  const boxPlotRows = useMemo(() => {
    const byDriver: Record<number, { drv: Driver; drops: number[] }> = {};
    results.forEach(r => {
      if (!byDriver[r.driver.driver_number]) byDriver[r.driver.driver_number] = { drv: r.driver, drops: [] };
      r.events.forEach(e => byDriver[r.driver.driver_number].drops.push(e.speedDrop));
    });
    return Object.values(byDriver)
      .filter(d => d.drops.length > 0)
      .sort((a, b) => median(b.drops) - median(a.drops))
      .map(d => ({ label: d.drv.name_acronym, color: d.drv.team_colour || "666", times: d.drops }));
  }, [results]);

  // Scatter data
  const scatterData: ScatterPoint[] = useMemo(() => {
    return results.flatMap(r =>
      r.events.map(e => ({
        x: e.distance,
        y: e.speedDrop,
        color: r.driver.team_colour || "666",
        label: r.driver.name_acronym,
      }))
    );
  }, [results]);

  // Driver summary
  const driverSummary = useMemo(() => {
    const byDriver: Record<number, DriverClipResult[]> = {};
    results.forEach(r => {
      if (!byDriver[r.driver.driver_number]) byDriver[r.driver.driver_number] = [];
      byDriver[r.driver.driver_number].push(r);
    });
    return Object.entries(byDriver).map(([dn, recs]) => {
      const drv = drvMap[Number(dn)];
      const totalEvents = recs.reduce((s, r) => s + r.clipCount, 0);
      const allDrops = recs.flatMap(r => r.events.map(e => e.speedDrop));
      return {
        driver: drv,
        totalEvents,
        avgDrop: allDrops.length ? median(allDrops) : 0,
        worstDrop: allDrops.length ? Math.max(...allDrops) : 0,
        lapsAnalyzed: recs.length,
      };
    }).sort((a, b) => b.worstDrop - a.worstDrop);
  }, [results, drvMap]);

  if (loading) {
    return (
      <div style={{ ...sty.card, textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: M }}>{progress}</div>
      </div>
    );
  }

  if (!results.length && !loading) {
    return (
      <div style={{ ...sty.card, textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No super clipping events detected</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 8 }}>
          Speed decreasing while throttle is at {THROTTLE_THRESHOLD}% with no braking. Min drop: {MIN_SPEED_DROP} km/h.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, color: "#5a5a6e", fontFamily: F }}>Laps per driver:</span>
          {[3, 5, 10].map(n => (
            <button
              key={n}
              onClick={() => setSampleLaps(n)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: M,
                cursor: "pointer", border: "none",
                background: sampleLaps === n ? "linear-gradient(135deg, #e10600, #b80500)" : "rgba(255,255,255,0.03)",
                color: sampleLaps === n ? "#fff" : "#5a5a6e",
              }}
            >{n}</button>
          ))}
        </div>
        <ShareButton domRef={contentRef} filename="openf1ow-super-clipping" />
      </div>
      <div ref={contentRef}>
        {/* Explanation */}
        <div style={{ ...sty.card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: M, lineHeight: 1.6 }}>
            <strong style={{ color: "rgba(255,255,255,0.5)" }}>Super Clipping</strong> — Speed decreasing while throttle is at {THROTTLE_THRESHOLD}% and brake is off.
            Indicates power delivery limits, aero drag, tyre grip loss, or engine mapping constraints.
            Analyzed top {sampleLaps} fastest clean laps per driver. Min speed drop: {MIN_SPEED_DROP} km/h.
          </div>
        </div>

        {/* Driver ranking table */}
        <div style={sty.card}>
          <div style={sty.sectionHead}>Clipping Severity by Driver</div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["#", "Driver", "Events", "Median Drop", "Worst Drop", "Laps"].map(h => (
                    <th key={h} style={sty.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {driverSummary.map((d, i) => (
                  <tr
                    key={d.driver?.driver_number}
                    style={rowBg(i)}
                  >
                    <td style={{ ...sty.td, color: podiumColor(i), fontWeight: 700, fontFamily: M, width: 30 }}>{i + 1}</td>
                    <td style={{ ...sty.td, fontWeight: 700, fontFamily: F }}>
                      <span style={{ display: "inline-block", width: 3, height: 14, borderRadius: 2, background: "#" + (d.driver?.team_colour || "666"), marginRight: 8, verticalAlign: "middle" }} />
                      {d.driver?.name_acronym || "???"}
                    </td>
                    <td style={{ ...sty.td, fontFamily: M }}>{d.totalEvents}</td>
                    <td style={{ ...sty.td, fontFamily: M, color: d.avgDrop > 10 ? "#ef4444" : d.avgDrop > 5 ? "#eab308" : "#6b7d9e" }}>
                      {d.avgDrop.toFixed(1)} km/h
                    </td>
                    <td style={{ ...sty.td, fontFamily: M, color: d.worstDrop > 10 ? "#ef4444" : d.worstDrop > 5 ? "#eab308" : "#6b7d9e" }}>
                      {d.worstDrop.toFixed(1)} km/h
                    </td>
                    <td style={{ ...sty.td, fontFamily: M, color: "#5a5a6e" }}>{d.lapsAnalyzed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Clipping distribution box plot */}
        {boxPlotRows.length > 0 && (
          <div style={{ ...sty.card, marginTop: 12 }}>
            <div style={sty.sectionHead}>Clipping Distribution (Top {sampleLaps} Fastest Laps)</div>
            <div style={{ marginTop: 10 }}>
              <BoxPlotChart rows={boxPlotRows} valueFmt={(v) => v.toFixed(1) + " km/h"} />
            </div>
          </div>
        )}

        {/* Scatter: all clipping events */}
        {scatterData.length > 0 && (
          <div style={{ ...sty.card, marginTop: 12 }}>
            <div style={sty.sectionHead}>All Clipping Events — Position vs Severity</div>
            <div style={{ marginTop: 10 }}>
              <ScatterPlot
                data={scatterData}
                xLabel="Track Distance (m)"
                yLabel="Speed Lost (km/h)"
                xFmt={(v) => v >= 1000 ? (v / 1000).toFixed(1) + "km" : v.toFixed(0) + "m"}
                yFmt={(v) => v.toFixed(1)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
