import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AIAnalysis from "./components/AIAnalysis";
import RaceReplay from "./components/RaceReplay";
import type { Driver, Lap, Stint, Pit, Weather } from "./lib/types";
import { median, linearSlope, computeSlowLapThreshold, isCleanLap, FUEL_TOTAL_KG, FUEL_SEC_PER_KG, DIRTY_AIR_THRESHOLD } from "./lib/raceUtils";
import { F, M, sty } from "./lib/styles";
import { buildFullSummary } from "./lib/buildAnalysisSummary";
import { api } from "./lib/api";
import { ft3, ft1, ftn, podiumColor, rowBg } from "./lib/format";
import { TC, DRIVER_COLORS } from "./lib/constants";
import { initCanvas } from "./lib/canvas";
import useTooltip from "./components/analysis/useTooltip";
import ScatterPlot from "./components/analysis/ScatterPlot";
import type { ScatterPoint } from "./components/analysis/useTooltip";
import SubTab from "./components/analysis/SubTab";
import ViewToggle from "./components/analysis/ViewToggle";
import BoxPlotChart, { teamAbbr } from "./components/analysis/BoxPlotChart";
import LapEvolutionChart from "./components/analysis/LapEvolutionChart";
import RacePaceRanking from "./components/analysis/RacePaceRanking";
import StintDegradation from "./components/analysis/StintDegradation";
import TeammateDelta from "./components/analysis/TeammateDelta";
import PitStopRanking from "./components/analysis/PitStopRanking";
import ConstructorPace from "./components/analysis/ConstructorPace";
import SectorAnalysis from "./components/analysis/SectorAnalysis";
import FuelVisualization from "./components/analysis/FuelVisualization";
import WeatherCorrelation from "./components/analysis/WeatherCorrelation";
import DirtyAirAnalysis from "./components/analysis/DirtyAirAnalysis";
import SuperClipping from "./components/analysis/SuperClipping";

export default function RaceAnalysis({ sessionKey, drivers, weather, raceControl = [], results = [], subTab, onSubTabChange }: {
  sessionKey: string;
  drivers: Driver[];
  weather: Weather[];
  raceControl?: any[];
  results?: any[];
  subTab: string;
  onSubTabChange: (tab: string) => void;
}) {
  const [allLaps, setAllLaps] = useState<Lap[]>([]);
  const [allStints, setAllStints] = useState<Stint[]>([]);
  const [allPits, setAllPits] = useState<Pit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");
  const [progress, setProgress] = useState("");

  // Reset when session changes
  useEffect(() => {
    setAllLaps([]);
    setAllStints([]);
    setAllPits([]);
    setLoaded(false);
    setLoading(false);
    setError("");
    onSubTabChange("pace");
  }, [sessionKey, onSubTabChange]);

  const driverCount = useMemo(() => new Set(allLaps.map(l => l.driver_number)).size, [allLaps]);

  // Shared derived data — computed once, used by multiple analytics sections
  const sharedThreshold = useMemo(() => computeSlowLapThreshold(allLaps), [allLaps]);
  const sharedLapMap = useMemo(() => {
    const m: Record<number, Lap[]> = {};
    allLaps.forEach(l => { if (!m[l.driver_number]) m[l.driver_number] = []; m[l.driver_number].push(l); });
    return m;
  }, [allLaps]);
  const sharedLapLookup = useMemo(() => {
    const m: Record<string, Lap> = {};
    allLaps.forEach(l => { m[l.driver_number + "-" + l.lap_number] = l; });
    return m;
  }, [allLaps]);
  const sharedLapsByNumber = useMemo(() => {
    const m: Record<number, { dn: number; ts: number }[]> = {};
    allLaps.forEach(l => {
      if (!l.date_start) return;
      if (!m[l.lap_number]) m[l.lap_number] = [];
      m[l.lap_number].push({ dn: l.driver_number, ts: new Date(l.date_start).getTime() });
    });
    return m;
  }, [allLaps]);
  const sharedTeams = useMemo(() => {
    const m: Record<string, { drivers: Driver[]; color: string }> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!m[t]) m[t] = { drivers: [], color: d.team_colour || "666" };
      m[t].drivers.push(d);
    });
    return m;
  }, [drivers]);

  // Auto-load when session/drivers are ready
  useEffect(() => {
    if (sessionKey && drivers.length && !loaded && !loading) fetchAll();
  }, [sessionKey, drivers]);

  const fetchAll = useCallback(async () => {
    if (!sessionKey || !drivers.length) return;
    setLoading(true);
    setError("");
    setProgress("Fetching lap data for all drivers...");

    try {
      // Fetch all laps for the session (no driver filter = all drivers)
      const [laps, stints, pits] = await Promise.all([
        api("/laps?session_key=" + sessionKey),
        api("/stints?session_key=" + sessionKey).catch(() => []),
        api("/pit?session_key=" + sessionKey).catch(() => []),
      ]);

      setAllLaps(laps);
      setAllStints(stints);
      setAllPits(pits);
      setLoaded(true);
      setProgress("");
    } catch (e: any) {
      setError(e.message);
      setProgress("");
    }
    setLoading(false);
  }, [sessionKey, drivers]);

  if (!loaded && !loading) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ ...sty.sectionHead, marginBottom: 16 }}>Race Analysis</div>
          <p style={{ color: "#b0b0c0", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Analyze pace, tire degradation, teammate battles, and pit stop efficiency across all drivers.
          </p>
          <button onClick={fetchAll} style={{
            background: "#e10600",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 28px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: F,
            letterSpacing: "0.3px",
            transition: "all 0.2s ease",
          }}>
            Load Race Analysis
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 40, color: "#5a5a6e", fontSize: 13, fontWeight: 500 }}>
          {progress || "Loading..."}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: "rgba(220, 38, 38, 0.12)",
        border: "1px solid rgba(220, 38, 38, 0.2)",
        padding: 12, borderRadius: 10, marginBottom: 10,
        fontSize: 13, color: "#fca5a5",
      }}>
        {error}
        <button onClick={() => { setError(""); setLoaded(false); }} style={{
          background: "none", border: "none", color: "#fca5a5",
          cursor: "pointer", marginLeft: 8, fontSize: 14, fontWeight: 600,
        }}>{"\u2715"}</button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div style={{ ...sty.card, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "14px 18px" }}>
        {([
          ["Drivers", driverCount],
          ["Total Laps", allLaps.length],
          ["Pit Stops", allPits.length],
          ["Stints", allStints.length],
        ] as const).map(([label, val]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={sty.statLabel}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: M }}>{val}</div>
          </div>
        ))}
        <button onClick={() => {
          const summary = buildFullSummary({
            allLaps, drivers, stints: allStints, pits: allPits, weather,
            raceControl, results,
          });
          const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "race-analysis-" + sessionKey + ".json";
          a.click();
          URL.revokeObjectURL(url);
        }} style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#b0b0c0",
          cursor: "pointer",
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: F,
          whiteSpace: "nowrap" as const,
        }} title="Download race analysis data as JSON">
          Export JSON
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap", padding: "2px 0" }}>
        {([
          ["ai", "\u2728 AI Analysis"],
          ["replay", "\u25B6 Replay"],
          ["pace", "Race Pace"],
          ["sectors", "Sectors"],
          ["constructors", "Constructors"],
          ["clipping", "Super Clipping"],
          ["evolution", "Lap Evolution"],
          ["degradation", "Tire Deg"],
          ["dirtyair", "Dirty Air"],
          ["teammates", "Teammates"],
          ["pitstops", "Pit Stops"],
          ["fuel", "Fuel"],
          ["weather", "Weather"],
        ] as const).map(([k, v]) => (
          <SubTab key={k} active={subTab === k} onClick={() => onSubTabChange(k)}>{v}</SubTab>
        ))}
      </div>

      {/* Content */}
      {subTab === "ai" && (
        <AIAnalysis
          allLaps={allLaps}
          drivers={drivers}
          stints={allStints}
          pits={allPits}
          weather={weather}
          raceControl={raceControl}
          results={results}
        />
      )}

      {subTab === "replay" && (
        <div style={sty.card}>
          <RaceReplay sessionKey={sessionKey} drivers={drivers} />
        </div>
      )}

      {subTab === "pace" && (<>
        <div style={sty.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={sty.sectionHead}>Race Pace Ranking</span>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Who was genuinely fastest on track? Each driver's median lap time on normal racing laps — slow laps (safety car, traffic, mistakes) are filtered out so you see true race speed.
          </p>
          <RacePaceRanking allLaps={allLaps} drivers={drivers} viewMode={viewMode} />
        </div>
        {/* Pace Consistency & Standard Deviation */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Pace Consistency</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Standard deviation of clean lap times — lower = more consistent. A metronomic driver extracts more from their car. High std dev suggests traffic, mistakes, or varied tyre performance.
          </p>
          {(() => {
            const rows = drivers.map(d => {
              const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
              if (clean.length < 5) return null;
              const med = median(clean);
              const mean = clean.reduce((s, t) => s + t, 0) / clean.length;
              const stdDev = Math.sqrt(clean.reduce((s, t) => s + (t - mean) ** 2, 0) / clean.length);
              const totalLaps = (sharedLapMap[d.driver_number] || []).length;
              const cleanPct = (clean.length / totalLaps * 100);
              return { driver: d, color: d.team_colour || "666", stdDev, med, cleanLaps: clean.length, totalLaps, cleanPct };
            }).filter(Boolean) as { driver: Driver; color: string; stdDev: number; med: number; cleanLaps: number; totalLaps: number; cleanPct: number }[];
            rows.sort((a, b) => a.stdDev - b.stdDev);
            if (!rows.length) return null;
            const maxStd = Math.max(...rows.map(r => r.stdDev));
            return (
              <div>
                {rows.map((r, i) => (
                  <div key={r.driver.driver_number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 22, textAlign: "right", fontWeight: 800, fontSize: 11, color: podiumColor(i), fontFamily: F, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ width: 44, fontWeight: 700, fontSize: 11, fontFamily: F, color: "#" + r.color, flexShrink: 0 }}>{r.driver.name_acronym}</div>
                    <div style={{ flex: 1, position: "relative", height: 16 }}>
                      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 16, borderRadius: 3, background: "rgba(255,255,255,0.02)" }} />
                      <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(2, (r.stdDev / maxStd) * 100) + "%", height: 16, borderRadius: 3, background: r.stdDev < 0.3 ? "rgba(34,197,94,0.4)" : r.stdDev < 0.6 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)" }} />
                    </div>
                    <div style={{ fontFamily: M, fontSize: 10, fontWeight: 600, width: 48, textAlign: "right", color: r.stdDev < 0.3 ? "#22c55e" : r.stdDev < 0.6 ? "#fbbf24" : "#ef4444" }}>{r.stdDev.toFixed(3)}s</div>
                    <div style={{ fontFamily: M, fontSize: 9, width: 42, textAlign: "right", color: "#5a5a6e" }}>{r.cleanPct.toFixed(0)}% clean</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Best Lap vs Median Pace</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Points near the diagonal line are consistent — their best lap is close to their median. Points far above the diagonal peak high but can't sustain it.
          </p>
          {(() => {
            const pts: ScatterPoint[] = [];
            drivers.forEach(d => {
              const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
              if (clean.length < 3) return;
              pts.push({ x: Math.min(...clean), y: median(clean), color: d.team_colour || "666", label: d.name_acronym });
            });
            return <ScatterPlot data={pts} xLabel="Best Lap (s)" yLabel="Median Pace (s)" xFmt={ft3} yFmt={ft3} diagonal />;
          })()}
        </div>
      </>)}

      {subTab === "sectors" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Sector Analysis</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Where does each driver gain or lose time? Compares median sector pace to the session best. Hover any row for full breakdown including best times and theoretical lap.
          </p>
          <SectorAnalysis allLaps={allLaps} drivers={drivers} />
        </div>
      )}

      {subTab === "fuel" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Fuel Consumption Model</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            F1 cars start with ~110kg of fuel. As fuel burns off, the car gets lighter and faster — about 0.055s per kg per lap. The chart shows estimated fuel load and cumulative time gained from fuel burn-off over the race distance.
          </p>
          <FuelVisualization allLaps={allLaps} drivers={drivers} />
        </div>
      )}

      {subTab === "evolution" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Lap Time Evolution</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Every driver's lap time plotted lap-by-lap. Shows tire degradation trends, the effect of pit stops, and when drivers push vs. manage pace.
          </p>
          <LapEvolutionChart allLaps={allLaps} drivers={drivers} />
        </div>
      )}

      {subTab === "degradation" && (<>
        <div style={sty.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={sty.sectionHead}>Tire Degradation by Stint</span>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            How much slower does each driver get per lap on each tire compound? "Deg/Lap" is fuel-corrected (lighter car = faster, so raw times understate true tire wear). First 2 laps of each stint excluded (cold tires).
          </p>
          <StintDegradation allLaps={allLaps} drivers={drivers} stints={allStints} viewMode={viewMode} />
        </div>
        {/* Compound Performance Summary */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Compound Performance Summary</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Average degradation and stint length by tire compound across all drivers. Shows which compound was the fastest and which lasted longest.
          </p>
          {(() => {
            const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
            const fuelCorr = (FUEL_TOTAL_KG / totalRaceLaps) * FUEL_SEC_PER_KG;
            const compoundStats: Record<string, { degs: number[]; paces: number[]; stintLens: number[]; count: number }> = {};
            allStints.forEach(st => {
              const laps: Lap[] = [];
              for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
                const l = sharedLapLookup[st.driver_number + "-" + ln];
                if (l && isCleanLap(l, sharedThreshold)) laps.push(l);
              }
              const usable = laps.slice(2);
              if (usable.length < 3) return;
              const xs = usable.map((_, i) => i);
              const ys = usable.map(l => l.lap_duration! + (l.lap_number - 1) * fuelCorr);
              const deg = Math.max(0, linearSlope(xs, ys));
              const avgPace = median(usable.map(l => l.lap_duration!));
              const c = st.compound;
              if (!compoundStats[c]) compoundStats[c] = { degs: [], paces: [], stintLens: [], count: 0 };
              compoundStats[c].degs.push(deg);
              compoundStats[c].paces.push(avgPace);
              compoundStats[c].stintLens.push(st.lap_end - st.lap_start + 1);
              compoundStats[c].count++;
            });
            const order = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
            const compounds = Object.entries(compoundStats).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
            if (!compounds.length) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {compounds.map(([compound, stats]) => {
                  const avgDeg = median(stats.degs);
                  const avgPace = median(stats.paces);
                  const avgLen = median(stats.stintLens);
                  return (
                    <div key={compound} style={{
                      background: "rgba(10,14,20,0.5)", borderRadius: 8, padding: "12px 16px",
                      borderTop: "3px solid " + (TC[compound] || "#666"),
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: TC[compound] || "#666", fontFamily: F, marginBottom: 8 }}>{compound}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 12px", fontSize: 10 }}>
                        <span style={{ color: "#5a5a6e" }}>Avg Deg/Lap</span>
                        <span style={{ fontFamily: M, fontWeight: 600, color: avgDeg < 0.05 ? "#22c55e" : avgDeg < 0.1 ? "#fbbf24" : "#ef4444" }}>{avgDeg.toFixed(4)}s</span>
                        <span style={{ color: "#5a5a6e" }}>Median Pace</span>
                        <span style={{ fontFamily: M, fontWeight: 600 }}>{ft3(avgPace)}</span>
                        <span style={{ color: "#5a5a6e" }}>Avg Stint Length</span>
                        <span style={{ fontFamily: M, fontWeight: 600 }}>{avgLen.toFixed(0)} laps</span>
                        <span style={{ color: "#5a5a6e" }}>Stints Used</span>
                        <span style={{ fontFamily: M, fontWeight: 600 }}>{stats.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Stint Length vs Degradation</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Do longer stints suffer more degradation? Each dot is one stint. Colored by compound: {Object.entries(TC).map(([k, c]) => <span key={k} style={{ color: c, fontWeight: 600, marginRight: 8 }}>{k}</span>)}
          </p>
          {(() => {
            const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
            const fuelCorr = (FUEL_TOTAL_KG / totalRaceLaps) * FUEL_SEC_PER_KG;
            const pts: ScatterPoint[] = [];
            allStints.forEach(st => {
              const drv = drivers.find(d => d.driver_number === st.driver_number);
              if (!drv) return;
              const laps: Lap[] = [];
              for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
                const l = sharedLapLookup[st.driver_number + "-" + ln];
                if (l && isCleanLap(l, sharedThreshold)) laps.push(l);
              }
              const usable = laps.slice(2);
              if (usable.length < 3) return;
              const xs = usable.map((_, i) => i);
              const ys = usable.map(l => l.lap_duration! + (l.lap_number - 1) * fuelCorr);
              const deg = Math.max(0, linearSlope(xs, ys));
              const stintLen = st.lap_end - st.lap_start + 1;
              // Use compound color instead of team color
              const compColor = TC[st.compound]?.replace("#", "") || drv.team_colour || "666";
              pts.push({ x: stintLen, y: deg, color: compColor, label: drv.name_acronym });
            });
            return <ScatterPlot data={pts} xLabel="Stint Length (laps)" yLabel="Deg/Lap (s)" xFmt={v => v.toFixed(0)} yFmt={v => v.toFixed(4)} />;
          })()}
        </div>
      </>)}

      {subTab === "teammates" && (<>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Teammate Pace Comparison</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Same car, different drivers — who was faster? Compares teammates on laps where both set a clean time, revealing driver vs. car performance.
          </p>
          <TeammateDelta allLaps={allLaps} drivers={drivers} />
        </div>
        {/* Head-to-head lap wins */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Head-to-Head Lap Wins</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            On each lap where both teammates set a valid time, who was faster? The split bar shows dominance — a 70/30 split means one driver was faster on 70% of comparable laps.
          </p>
          {(() => {
            return Object.entries(sharedTeams).filter(([, t]) => t.drivers.length >= 2).map(([team, t]) => {
              const [d1, d2] = t.drivers.slice(0, 2);
              const l1 = (sharedLapMap[d1.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);
              const l2 = (sharedLapMap[d2.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);
              const l1Map: Record<number, number> = {};
              l1.forEach(l => { l1Map[l.lap_number] = l.lap_duration!; });
              let d1Wins = 0, d2Wins = 0;
              l2.forEach(l => {
                if (l1Map[l.lap_number]) {
                  if (l1Map[l.lap_number] < l.lap_duration!) d1Wins++; else d2Wins++;
                }
              });
              const total = d1Wins + d2Wins;
              if (total < 3) return null;
              const d1Pct = (d1Wins / total) * 100;
              const c = t.color;
              return (
                <div key={team} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#" + c, marginBottom: 4, fontFamily: F }}>{team}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 36, fontSize: 10, fontWeight: 700, color: d1Pct >= 50 ? "#22c55e" : "#b0b0c0", fontFamily: F, textAlign: "right" }}>{d1.name_acronym}</div>
                    <div style={{ flex: 1, display: "flex", height: 20, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: d1Pct + "%", background: d1Pct >= 50 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {d1Pct >= 25 && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: M, color: "#fff" }}>{d1Wins} ({d1Pct.toFixed(0)}%)</span>}
                      </div>
                      <div style={{ width: (100 - d1Pct) + "%", background: d1Pct < 50 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {(100 - d1Pct) >= 25 && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: M, color: "#fff" }}>{d2Wins} ({(100 - d1Pct).toFixed(0)}%)</span>}
                      </div>
                    </div>
                    <div style={{ width: 36, fontSize: 10, fontWeight: 700, color: d1Pct < 50 ? "#22c55e" : "#b0b0c0", fontFamily: F }}>{d2.name_acronym}</div>
                  </div>
                </div>
              );
            }).filter(Boolean);
          })()}
        </div>
      </>)}

      {subTab === "pitstops" && (<>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Pit Stop Efficiency</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Which pit crew was fastest? Teams ranked by average time stationary in the pit box.
          </p>
          <PitStopRanking pits={allPits} drivers={drivers} />
        </div>
        {/* Pit Window Timeline */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Pit Window Timeline</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            When did each team pit? Dots show pit stop laps — clustered stops indicate a strategic pit window. Teams that pit outside the cluster may have used an undercut/overcut strategy.
          </p>
          {(() => {
            const totalLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
            const drvMap: Record<number, Driver> = {};
            drivers.forEach(d => { drvMap[d.driver_number] = d; });
            const teamStops: Record<string, { color: string; stops: { driver: string; lap: number; dur: number | null }[] }> = {};
            allPits.forEach(p => {
              const d = drvMap[p.driver_number];
              if (!d) return;
              const t = d.team_name || "Unknown";
              if (!teamStops[t]) teamStops[t] = { color: d.team_colour || "666", stops: [] };
              teamStops[t].stops.push({ driver: d.name_acronym, lap: p.lap_number, dur: p.pit_duration || p.lane_duration || p.stop_duration });
            });
            const sorted = Object.entries(teamStops).sort((a, b) => {
              const aFirst = Math.min(...a[1].stops.map(s => s.lap));
              const bFirst = Math.min(...b[1].stops.map(s => s.lap));
              return aFirst - bFirst;
            });
            if (!sorted.length) return null;
            // Lap labels
            const step = totalLaps <= 30 ? 5 : totalLaps <= 50 ? 5 : 10;
            return (
              <div>
                <div style={{ display: "flex", marginBottom: 2 }}>
                  <div style={{ width: 80, flexShrink: 0 }} />
                  <div style={{ flex: 1, position: "relative", height: 14 }}>
                    {Array.from({ length: Math.ceil(totalLaps / step) }, (_, i) => (i + 1) * step).filter(l => l <= totalLaps).map(l => (
                      <span key={l} style={{ position: "absolute", left: (l / totalLaps * 100) + "%", transform: "translateX(-50%)", fontSize: 8, fontFamily: M, color: "#3d4f6f" }}>L{l}</span>
                    ))}
                  </div>
                </div>
                {sorted.map(([team, { color, stops }]) => (
                  <div key={team} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 80, fontSize: 10, fontWeight: 700, color: "#" + color, fontFamily: F, flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap" as const }}>{team.length > 12 ? team.slice(0, 12) + ".." : team}</div>
                    <div style={{ flex: 1, position: "relative", height: 20 }}>
                      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 20, borderRadius: 3, background: "rgba(255,255,255,0.02)" }} />
                      {stops.map((s, si) => (
                        <div key={si} title={`${s.driver} L${s.lap}${s.dur ? " — " + s.dur.toFixed(1) + "s" : ""}`} style={{
                          position: "absolute",
                          left: (s.lap / totalLaps * 100) + "%",
                          top: 3, width: 12, height: 14, borderRadius: 3,
                          background: "#" + color, opacity: 0.7,
                          transform: "translateX(-50%)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 7, fontWeight: 700, color: "#000",
                        }}>{s.lap}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Pit Lap vs Duration</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Each dot is a pit stop. X = when it happened, Y = how long it took. Clusters reveal strategic pit windows. Outliers may indicate problems.
          </p>
          {(() => {
            const drvMap: Record<number, Driver> = {};
            drivers.forEach(d => { drvMap[d.driver_number] = d; });
            const pts: ScatterPoint[] = [];
            allPits.forEach(p => {
              const d = drvMap[p.driver_number];
              if (!d) return;
              const dur = p.pit_duration || p.lane_duration || p.stop_duration;
              if (!dur || !p.lap_number) return;
              pts.push({ x: p.lap_number, y: dur, color: d.team_colour || "666", label: d.name_acronym });
            });
            return <ScatterPlot data={pts} xLabel="Lap Number" yLabel="Duration (s)" xFmt={v => "L" + v.toFixed(0)} yFmt={v => v.toFixed(1)} />;
          })()}
        </div>
      </>)}

      {subTab === "constructors" && (<>
        <div style={sty.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={sty.sectionHead}>Constructor Pace Ranking</span>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Which team had the fastest car? Both drivers' laps combined into a single team pace, with individual breakdowns showing each driver's contribution.
          </p>
          <ConstructorPace allLaps={allLaps} drivers={drivers} viewMode={viewMode} />
        </div>
        {/* Intra-team gap */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Intra-Team Driver Gap</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Median pace difference between teammates. A small gap means the car is performing equally for both drivers — a large gap may indicate setup issues, driver error, or one driver adapting better to conditions.
          </p>
          {(() => {
            const gaps = Object.entries(sharedTeams).filter(([, t]) => t.drivers.length >= 2).map(([team, t]) => {
              const meds = t.drivers.map(d => {
                const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
                return { driver: d, med: clean.length >= 3 ? median(clean) : null };
              }).filter(m => m.med != null).sort((a, b) => a.med! - b.med!);
              if (meds.length < 2) return null;
              return { team, color: t.color, faster: meds[0].driver, slower: meds[1].driver, fasterMed: meds[0].med!, slowerMed: meds[1].med!, gap: meds[1].med! - meds[0].med! };
            }).filter(Boolean) as { team: string; color: string; faster: Driver; slower: Driver; fasterMed: number; slowerMed: number; gap: number }[];
            gaps.sort((a, b) => a.gap - b.gap);
            if (!gaps.length) return null;
            const maxGap = Math.max(...gaps.map(g => g.gap));
            return gaps.map((g, i) => (
              <div key={g.team} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 100, flexShrink: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#" + g.color, fontFamily: F }}>{g.team.length > 14 ? g.team.slice(0, 14) + ".." : g.team}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", width: 36, textAlign: "center", fontFamily: F }}>{g.faster.name_acronym}</div>
                <div style={{ flex: 1, position: "relative", height: 18 }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 18, borderRadius: 4, background: "rgba(255,255,255,0.02)" }} />
                  <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(4, maxGap > 0 ? (g.gap / maxGap) * 100 : 0) + "%", height: 18, borderRadius: 4, background: g.gap < 0.1 ? "rgba(34,197,94,0.4)" : g.gap < 0.3 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)" }} />
                  <div style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, fontFamily: M, color: g.gap < 0.1 ? "#22c55e" : g.gap < 0.3 ? "#fbbf24" : "#ef4444" }}>
                    {g.gap.toFixed(3)}s
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#ef4444", width: 36, textAlign: "center", fontFamily: F }}>{g.slower.name_acronym}</div>
              </div>
            ));
          })()}
        </div>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Driver 1 vs Driver 2 Pace</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Each dot is a team. X = faster driver's median, Y = slower driver's median. Points near the diagonal = balanced team. Far above = one driver struggling.
          </p>
          {(() => {
            const pts: ScatterPoint[] = [];
            Object.entries(sharedTeams).forEach(([team, t]) => {
              if (t.drivers.length < 2) return;
              const meds = t.drivers.map(d => {
                const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
                return clean.length >= 3 ? median(clean) : null;
              }).filter(m => m != null).sort((a, b) => a! - b!) as number[];
              if (meds.length < 2) return;
              pts.push({ x: meds[0], y: meds[1], color: t.color, label: team.length > 10 ? team.slice(0, 10) + ".." : team });
            });
            return <ScatterPlot data={pts} xLabel="Faster Driver Median (s)" yLabel="Slower Driver Median (s)" xFmt={ft3} yFmt={ft3} diagonal />;
          })()}
        </div>
      </>)}

      {subTab === "weather" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Weather Correlation</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Did hotter track temps slow everyone down? Shows how lap times changed with temperature, and which drivers adapted best to changing conditions.
          </p>
          <WeatherCorrelation allLaps={allLaps} drivers={drivers} weather={weather} />
        </div>
      )}

      {subTab === "dirtyair" && (<>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Dirty Air Analysis</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            When a car follows within {DIRTY_AIR_THRESHOLD}s of another, it loses downforce from turbulent air — this is "dirty air". Below shows when each driver was stuck in traffic, who they were behind, and how much time they lost per lap as a result. Time loss is fuel-corrected and compared against each driver's own clean-air pace to isolate the effect.
          </p>
          <DirtyAirAnalysis allLaps={allLaps} drivers={drivers} stints={allStints} />
        </div>
        {/* Traffic Impact Matrix */}
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Traffic Interaction Summary</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Clean air ratio per driver — what percentage of their racing laps were spent in clean air? Drivers running at the front naturally have more clean air. Midfield drivers lose more time stuck in traffic.
          </p>
          {(() => {
            const drvData: Record<number, { clean: number; dirty: number }> = {};
            drivers.forEach(d => { drvData[d.driver_number] = { clean: 0, dirty: 0 }; });
            for (const [lapNumStr, entries] of Object.entries(sharedLapsByNumber)) {
              const lapNum = Number(lapNumStr);
              const sorted = [...entries].sort((a, b) => a.ts - b.ts);
              for (let i = 0; i < sorted.length; i++) {
                const lap = sharedLapLookup[sorted[i].dn + "-" + lapNum];
                if (!lap || !isCleanLap(lap, sharedThreshold)) continue;
                const gap = i > 0 ? (sorted[i].ts - sorted[i - 1].ts) / 1000 : 999;
                const dd = drvData[sorted[i].dn];
                if (gap < DIRTY_AIR_THRESHOLD) dd.dirty++; else dd.clean++;
              }
            }
            const rows = drivers.map(d => {
              const dd = drvData[d.driver_number];
              const total = dd.clean + dd.dirty;
              if (total < 5) return null;
              return { driver: d, color: d.team_colour || "666", clean: dd.clean, dirty: dd.dirty, total, pct: (dd.clean / total) * 100 };
            }).filter(Boolean) as { driver: Driver; color: string; clean: number; dirty: number; total: number; pct: number }[];
            rows.sort((a, b) => b.pct - a.pct);
            if (!rows.length) return null;
            return rows.map((r, i) => (
              <div key={r.driver.driver_number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 22, textAlign: "right", fontWeight: 800, fontSize: 11, color: podiumColor(i), fontFamily: F, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ width: 44, fontWeight: 700, fontSize: 11, fontFamily: F, color: "#" + r.color, flexShrink: 0 }}>{r.driver.name_acronym}</div>
                <div style={{ flex: 1, display: "flex", height: 16, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: r.pct + "%", background: "rgba(34,197,94,0.5)" }} />
                  <div style={{ width: (100 - r.pct) + "%", background: "rgba(239,68,68,0.35)" }} />
                </div>
                <div style={{ fontFamily: M, fontSize: 10, fontWeight: 600, width: 38, textAlign: "right", color: r.pct > 70 ? "#22c55e" : r.pct > 50 ? "#fbbf24" : "#ef4444" }}>
                  {r.pct.toFixed(0)}%
                </div>
                <div style={{ fontFamily: M, fontSize: 9, width: 52, textAlign: "right", color: "#5a5a6e" }}>
                  {r.clean}/{r.total}
                </div>
              </div>
            ));
          })()}
        </div>
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 10 }}>Gap vs Time Loss</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
            Per-driver: how close they followed (avg gap to car ahead on dirty laps) vs how much time they lost. Shows at what gap dirty air becomes costly — expect a curve rising steeply below ~1s.
          </p>
          {(() => {
            // Single pass: classify each driver's laps as clean/dirty + collect gaps
            const drvStats: Record<number, { gaps: number[]; cleanTimes: number[]; dirtyTimes: number[] }> = {};
            for (const [lapNumStr, entries] of Object.entries(sharedLapsByNumber)) {
              const lapNum = Number(lapNumStr);
              const sorted = [...entries].sort((a, b) => a.ts - b.ts);
              for (let i = 0; i < sorted.length; i++) {
                const lap = sharedLapLookup[sorted[i].dn + "-" + lapNum];
                if (!lap || !isCleanLap(lap, sharedThreshold)) continue;
                const gap = i > 0 ? (sorted[i].ts - sorted[i - 1].ts) / 1000 : 999;
                if (!drvStats[sorted[i].dn]) drvStats[sorted[i].dn] = { gaps: [], cleanTimes: [], dirtyTimes: [] };
                const dd = drvStats[sorted[i].dn];
                if (gap < DIRTY_AIR_THRESHOLD) {
                  dd.dirtyTimes.push(lap.lap_duration!);
                  dd.gaps.push(gap);
                } else {
                  dd.cleanTimes.push(lap.lap_duration!);
                }
              }
            }
            const pts: ScatterPoint[] = [];
            drivers.forEach(d => {
              const dd = drvStats[d.driver_number];
              if (!dd || dd.gaps.length < 3 || dd.cleanTimes.length < 3 || dd.dirtyTimes.length < 3) return;
              const timeLoss = median(dd.dirtyTimes) - median(dd.cleanTimes);
              pts.push({ x: median(dd.gaps), y: Math.max(0, timeLoss), color: d.team_colour || "666", label: d.name_acronym });
            });
            return <ScatterPlot data={pts} xLabel="Avg Gap in Traffic (s)" yLabel="Time Loss (s)" xFmt={v => v.toFixed(2)} yFmt={v => v.toFixed(3)} />;
          })()}
        </div>
      </>)}

      {subTab === "clipping" && (
        <SuperClipping sessionKey={sessionKey} allLaps={allLaps} drivers={drivers} />
      )}
    </div>
  );
}
