import { useState, useEffect, useCallback, useMemo } from "react";
import AIAnalysis from "./components/AIAnalysis";
import RaceReplay from "./components/RaceReplay";
import Commentary from "./components/Commentary";
import type { Driver, Lap, Stint, Pit, Weather } from "./lib/types";
import { median, linearSlope, computeSlowLapThreshold, isCleanLap, FUEL_TOTAL_KG, FUEL_SEC_PER_KG, DIRTY_AIR_THRESHOLD } from "./lib/raceUtils";
import { F, M, C, sty } from "./lib/styles";
import { buildFullSummary } from "./lib/buildAnalysisSummary";
import { api } from "./lib/api";
import { ft3, podiumColor } from "./lib/format";
import { TC } from "./lib/constants";
import ScatterPlot from "./components/analysis/ScatterPlot";
import type { ScatterPoint } from "./components/analysis/useTooltip";
import SubTab from "./components/analysis/SubTab";
import ViewToggle from "./components/analysis/ViewToggle";
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
import HeadlineInsights from "./components/analysis/HeadlineInsights";

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "pace", label: "Pace" },
  { key: "strategy", label: "Strategy" },
  { key: "battles", label: "Battles" },
  { key: "track", label: "Track" },
] as const;

// Section wrapper — replaces the repetitive ...sty.card + sectionHead + paragraph pattern.
function Section({ title, hint, actions, children }: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={sty.card}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: hint ? 6 : 14,
      }}>
        <h3 style={{ ...sty.sectionHead, margin: 0 }}>{title}</h3>
        {actions}
      </header>
      {hint && (
        <p style={{
          fontSize: 12.5,
          color: C.textMute,
          margin: "0 0 14px",
          lineHeight: 1.55,
          maxWidth: 760,
        }}>{hint}</p>
      )}
      {children}
    </section>
  );
}

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

  useEffect(() => {
    setAllLaps([]);
    setAllStints([]);
    setAllPits([]);
    setLoaded(false);
    setLoading(false);
    setError("");
  }, [sessionKey]);

  // Shared derived data
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

  const fetchAll = useCallback(async () => {
    if (!sessionKey || !drivers.length) return;
    setLoading(true);
    setError("");
    setProgress("Fetching lap data…");

    try {
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

  useEffect(() => {
    if (sessionKey && drivers.length && !loaded && !loading) fetchAll();
  }, [sessionKey, drivers]);

  if (!loaded && !loading) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: "28px 20px" }}>
          <h3 style={{ ...sty.sectionHead, marginBottom: 8 }}>Race analysis</h3>
          <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 18px", lineHeight: 1.55 }}>
            Pace, tires, teammate battles, pit stops and more — across every driver.
          </p>
          <button onClick={fetchAll} style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 24px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: F,
            transition: "opacity 0.2s ease",
          }}>
            Load race analysis
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 36, color: C.textDim, fontSize: 13 }}>
          {progress || "Loading…"}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={sty.err}>
        <span style={{ flex: 1 }}>{error}</span>
        <button onClick={() => { setError(""); setLoaded(false); }} style={{
          background: "none", border: "none", color: "inherit",
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4,
        }}>×</button>
      </div>
    );
  }

  const exportJson = () => {
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
  };

  return (
    <div>
      {/* Hero insights — always visible */}
      <HeadlineInsights
        allLaps={allLaps}
        drivers={drivers}
        stints={allStints}
        results={results}
        onOpenTab={onSubTabChange}
      />

      {/* View switcher + export */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {VIEWS.map(v => (
            <SubTab key={v.key} active={subTab === v.key} onClick={() => onSubTabChange(v.key)}>
              {v.label}
            </SubTab>
          ))}
        </div>
        <button onClick={exportJson} style={{
          background: "transparent",
          border: "1px solid " + C.border,
          color: C.textDim,
          cursor: "pointer",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: F,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.borderStrong; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.textDim; e.currentTarget.style.borderColor = C.border; }}
        title="Download race analysis data as JSON">
          Export JSON
        </button>
      </div>

      {/* ============================ OVERVIEW ============================ */}
      {subTab === "overview" && (
        <>
          <AIAnalysis
            allLaps={allLaps}
            drivers={drivers}
            stints={allStints}
            pits={allPits}
            weather={weather}
            raceControl={raceControl}
            results={results}
          />
          <Commentary
            sessionKey={sessionKey}
            allLaps={allLaps}
            drivers={drivers}
            stints={allStints}
            pits={allPits}
            results={results}
          />
        </>
      )}

      {/* ============================ PACE ============================ */}
      {subTab === "pace" && (
        <>
          <Section
            title="Race pace ranking"
            hint="Who was genuinely fastest on track? Each driver's median lap time on clean racing laps — slow laps (safety car, traffic, mistakes) filtered out."
            actions={<ViewToggle mode={viewMode} onChange={setViewMode} />}
          >
            <RacePaceRanking allLaps={allLaps} drivers={drivers} viewMode={viewMode} />
          </Section>

          <Section
            title="Pace consistency"
            hint="Standard deviation of clean lap times — lower = more metronomic. A consistent driver extracts more from their car over a race distance."
          >
            {(() => {
              const rows = drivers.map(d => {
                const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
                if (clean.length < 5) return null;
                const mean = clean.reduce((s, t) => s + t, 0) / clean.length;
                const stdDev = Math.sqrt(clean.reduce((s, t) => s + (t - mean) ** 2, 0) / clean.length);
                const totalLaps = (sharedLapMap[d.driver_number] || []).length;
                const cleanPct = (clean.length / totalLaps * 100);
                return { driver: d, color: d.team_colour || "666", stdDev, cleanLaps: clean.length, totalLaps, cleanPct };
              }).filter(Boolean) as any[];
              rows.sort((a, b) => a.stdDev - b.stdDev);
              if (!rows.length) return null;
              const maxStd = Math.max(...rows.map(r => r.stdDev));
              return (
                <div>
                  {rows.map((r, i) => (
                    <div key={r.driver.driver_number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 22, textAlign: "right", fontWeight: 700, fontSize: 11, color: podiumColor(i), fontFamily: F }}>{i + 1}</div>
                      <div style={{ width: 44, fontWeight: 600, fontSize: 12, fontFamily: F, color: "#" + r.color }}>{r.driver.name_acronym}</div>
                      <div style={{ flex: 1, position: "relative", height: 16 }}>
                        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 16, borderRadius: 3, background: "rgba(255,255,255,0.03)" }} />
                        <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(2, (r.stdDev / maxStd) * 100) + "%", height: 16, borderRadius: 3, background: r.stdDev < 0.3 ? "rgba(46,213,115,0.35)" : r.stdDev < 0.6 ? "rgba(255,181,71,0.35)" : "rgba(255,84,114,0.35)" }} />
                      </div>
                      <div style={{ fontFamily: M, fontSize: 11, fontWeight: 600, width: 48, textAlign: "right", color: r.stdDev < 0.3 ? C.pos : r.stdDev < 0.6 ? C.warn : C.neg }}>{r.stdDev.toFixed(3)}s</div>
                      <div style={{ fontFamily: M, fontSize: 10, width: 52, textAlign: "right", color: C.textMute }}>{r.cleanPct.toFixed(0)}% clean</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Section>

          <Section
            title="Best lap vs median pace"
            hint="Points near the diagonal are consistent — their best lap is close to their median. Points far above peak high but can't sustain it."
          >
            {(() => {
              const pts: ScatterPoint[] = [];
              drivers.forEach(d => {
                const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
                if (clean.length < 3) return;
                pts.push({ x: Math.min(...clean), y: median(clean), color: d.team_colour || "666", label: d.name_acronym });
              });
              return <ScatterPlot data={pts} xLabel="Best Lap (s)" yLabel="Median Pace (s)" xFmt={ft3} yFmt={ft3} diagonal />;
            })()}
          </Section>

          <Section
            title="Sector analysis"
            hint="Where each driver gains or loses time. Compares median sector pace to the session best. Hover a row for the full breakdown including theoretical best lap."
          >
            <SectorAnalysis allLaps={allLaps} drivers={drivers} />
          </Section>

          <Section
            title="Lap-time evolution"
            hint="Every driver's lap time plotted lap-by-lap. Shows tire degradation trends, pit-stop effects, and when drivers push vs. manage pace."
          >
            <LapEvolutionChart allLaps={allLaps} drivers={drivers} />
          </Section>
        </>
      )}

      {/* ============================ STRATEGY ============================ */}
      {subTab === "strategy" && (
        <>
          <Section
            title="Tire degradation by stint"
            hint="How much slower does each driver get per lap on each compound? Fuel-corrected (lighter car = faster, so raw times understate true tire wear). First 2 laps of each stint excluded (cold tires)."
            actions={<ViewToggle mode={viewMode} onChange={setViewMode} />}
          >
            <StintDegradation allLaps={allLaps} drivers={drivers} stints={allStints} viewMode={viewMode} />
          </Section>

          <Section
            title="Compound performance summary"
            hint="Average degradation and stint length by tire compound across all drivers — which compound was fastest and which lasted longest."
          >
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
                        background: C.surfaceAlt,
                        borderRadius: 10,
                        padding: "12px 14px",
                        border: "1px solid " + C.border,
                        borderTop: "2px solid " + (TC[compound] || "#666"),
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TC[compound] || "#666", marginBottom: 8 }}>{compound}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 12px", fontSize: 11 }}>
                          <span style={{ color: C.textMute }}>Deg/lap</span>
                          <span style={{ fontFamily: M, fontWeight: 600, color: avgDeg < 0.05 ? C.pos : avgDeg < 0.1 ? C.warn : C.neg }}>{avgDeg.toFixed(4)}s</span>
                          <span style={{ color: C.textMute }}>Median pace</span>
                          <span style={{ fontFamily: M, fontWeight: 600 }}>{ft3(avgPace)}</span>
                          <span style={{ color: C.textMute }}>Avg stint</span>
                          <span style={{ fontFamily: M, fontWeight: 600 }}>{avgLen.toFixed(0)} laps</span>
                          <span style={{ color: C.textMute }}>Stints used</span>
                          <span style={{ fontFamily: M, fontWeight: 600 }}>{stats.count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Section>

          <Section
            title="Stint length vs degradation"
            hint="Do longer stints suffer more degradation? Each dot is one stint. Colored by compound."
          >
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
                const compColor = TC[st.compound]?.replace("#", "") || drv.team_colour || "666";
                pts.push({ x: stintLen, y: deg, color: compColor, label: drv.name_acronym });
              });
              return <ScatterPlot data={pts} xLabel="Stint Length (laps)" yLabel="Deg/Lap (s)" xFmt={v => v.toFixed(0)} yFmt={v => v.toFixed(4)} />;
            })()}
          </Section>

          <Section
            title="Fuel consumption model"
            hint="F1 cars start with ~110kg of fuel. As fuel burns off the car gets lighter and faster — about 0.055s/kg/lap. Estimated fuel load and cumulative time gain from fuel burn-off."
          >
            <FuelVisualization allLaps={allLaps} drivers={drivers} />
          </Section>

          <Section
            title="Pit-stop efficiency"
            hint="Which pit crew was fastest? Teams ranked by average time stationary in the pit box."
          >
            <PitStopRanking pits={allPits} drivers={drivers} />
          </Section>

          <Section
            title="Pit window timeline"
            hint="When did each team pit? Dots show pit laps — clustered stops indicate a strategic pit window. Stops outside the cluster may be undercut or overcut attempts."
          >
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
              const step = totalLaps <= 30 ? 5 : totalLaps <= 50 ? 5 : 10;
              return (
                <div>
                  <div style={{ display: "flex", marginBottom: 4 }}>
                    <div style={{ width: 80, flexShrink: 0 }} />
                    <div style={{ flex: 1, position: "relative", height: 14 }}>
                      {Array.from({ length: Math.ceil(totalLaps / step) }, (_, i) => (i + 1) * step).filter(l => l <= totalLaps).map(l => (
                        <span key={l} style={{ position: "absolute", left: (l / totalLaps * 100) + "%", transform: "translateX(-50%)", fontSize: 9, fontFamily: M, color: C.textFaint }}>L{l}</span>
                      ))}
                    </div>
                  </div>
                  {sorted.map(([team, { color, stops }]) => (
                    <div key={team} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 80, fontSize: 11, fontWeight: 600, color: "#" + color, flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap" }}>{team.length > 12 ? team.slice(0, 12) + "…" : team}</div>
                      <div style={{ flex: 1, position: "relative", height: 20 }}>
                        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 20, borderRadius: 3, background: "rgba(255,255,255,0.02)" }} />
                        {stops.map((s, si) => (
                          <div key={si} title={`${s.driver} L${s.lap}${s.dur ? " — " + s.dur.toFixed(1) + "s" : ""}`} style={{
                            position: "absolute",
                            left: (s.lap / totalLaps * 100) + "%",
                            top: 3, width: 12, height: 14, borderRadius: 3,
                            background: "#" + color, opacity: 0.8,
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
          </Section>

          <Section
            title="Pit lap vs duration"
            hint="Each dot is a pit stop. X = when it happened, Y = how long it took. Clusters reveal strategic pit windows; outliers may indicate problems."
          >
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
          </Section>
        </>
      )}

      {/* ============================ BATTLES ============================ */}
      {subTab === "battles" && (
        <>
          <Section
            title="Teammate pace"
            hint="Same car, different drivers — who was faster? Compares teammates on laps where both set a clean time, isolating driver vs. car."
          >
            <TeammateDelta allLaps={allLaps} drivers={drivers} />
          </Section>

          <Section
            title="Head-to-head lap wins"
            hint="On each lap where both teammates set a valid time, who was faster? A 70/30 split means one driver was faster on 70% of comparable laps."
          >
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
                  <div key={team} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#" + c, marginBottom: 5 }}>{team}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 36, fontSize: 11, fontWeight: 600, color: d1Pct >= 50 ? C.pos : C.textDim, textAlign: "right" }}>{d1.name_acronym}</div>
                      <div style={{ flex: 1, display: "flex", height: 20, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: d1Pct + "%", background: d1Pct >= 50 ? "rgba(46,213,115,0.45)" : "rgba(255,84,114,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {d1Pct >= 25 && <span style={{ fontSize: 10, fontWeight: 600, fontFamily: M, color: "#fff" }}>{d1Wins} ({d1Pct.toFixed(0)}%)</span>}
                        </div>
                        <div style={{ width: (100 - d1Pct) + "%", background: d1Pct < 50 ? "rgba(46,213,115,0.45)" : "rgba(255,84,114,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {(100 - d1Pct) >= 25 && <span style={{ fontSize: 10, fontWeight: 600, fontFamily: M, color: "#fff" }}>{d2Wins} ({(100 - d1Pct).toFixed(0)}%)</span>}
                        </div>
                      </div>
                      <div style={{ width: 36, fontSize: 11, fontWeight: 600, color: d1Pct < 50 ? C.pos : C.textDim }}>{d2.name_acronym}</div>
                    </div>
                  </div>
                );
              }).filter(Boolean);
            })()}
          </Section>

          <Section
            title="Constructor pace"
            hint="Which team had the fastest car? Both drivers' laps combined into a single team pace, with individual breakdowns showing each driver's contribution."
            actions={<ViewToggle mode={viewMode} onChange={setViewMode} />}
          >
            <ConstructorPace allLaps={allLaps} drivers={drivers} viewMode={viewMode} />
          </Section>

          <Section
            title="Intra-team driver gap"
            hint="Median pace difference between teammates. A small gap means the car performs equally for both — a large gap may signal setup differences, driver error, or one driver adapting better."
          >
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
              return gaps.map(g => (
                <div key={g.team} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 110, flexShrink: 0, overflow: "hidden" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#" + g.color }}>{g.team.length > 14 ? g.team.slice(0, 14) + "…" : g.team}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.pos, width: 36, textAlign: "center" }}>{g.faster.name_acronym}</div>
                  <div style={{ flex: 1, position: "relative", height: 18 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 18, borderRadius: 4, background: "rgba(255,255,255,0.03)" }} />
                    <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(4, maxGap > 0 ? (g.gap / maxGap) * 100 : 0) + "%", height: 18, borderRadius: 4, background: g.gap < 0.1 ? "rgba(46,213,115,0.35)" : g.gap < 0.3 ? "rgba(255,181,71,0.35)" : "rgba(255,84,114,0.35)" }} />
                    <div style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 600, fontFamily: M, color: g.gap < 0.1 ? C.pos : g.gap < 0.3 ? C.warn : C.neg }}>
                      {g.gap.toFixed(3)}s
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.neg, width: 36, textAlign: "center" }}>{g.slower.name_acronym}</div>
                </div>
              ));
            })()}
          </Section>

          <Section
            title="Driver 1 vs driver 2 pace"
            hint="Each dot is a team. Points near the diagonal = balanced team. Far above = one driver struggling."
          >
            {(() => {
              const pts: ScatterPoint[] = [];
              Object.entries(sharedTeams).forEach(([team, t]) => {
                if (t.drivers.length < 2) return;
                const meds = t.drivers.map(d => {
                  const clean = (sharedLapMap[d.driver_number] || []).filter(l => isCleanLap(l, sharedThreshold)).map(l => l.lap_duration!);
                  return clean.length >= 3 ? median(clean) : null;
                }).filter(m => m != null).sort((a, b) => a! - b!) as number[];
                if (meds.length < 2) return;
                pts.push({ x: meds[0], y: meds[1], color: t.color, label: team.length > 10 ? team.slice(0, 10) + "…" : team });
              });
              return <ScatterPlot data={pts} xLabel="Faster Driver Median (s)" yLabel="Slower Driver Median (s)" xFmt={ft3} yFmt={ft3} diagonal />;
            })()}
          </Section>

          <Section
            title="Dirty-air analysis"
            hint={`When a car follows within ${DIRTY_AIR_THRESHOLD}s of another, it loses downforce from turbulent air. Shows when each driver was stuck in traffic, who they were behind, and time lost per lap. Fuel-corrected and compared to each driver's own clean-air pace.`}
          >
            <DirtyAirAnalysis allLaps={allLaps} drivers={drivers} stints={allStints} />
          </Section>

          <Section
            title="Traffic interaction summary"
            hint="Clean-air ratio — what share of a driver's racing laps were spent in clean air. Front-runners naturally have more; midfield drivers lose more time stuck behind."
          >
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
                <div key={r.driver.driver_number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 22, textAlign: "right", fontWeight: 700, fontSize: 11, color: podiumColor(i) }}>{i + 1}</div>
                  <div style={{ width: 44, fontWeight: 600, fontSize: 12, color: "#" + r.color }}>{r.driver.name_acronym}</div>
                  <div style={{ flex: 1, display: "flex", height: 16, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: r.pct + "%", background: "rgba(46,213,115,0.45)" }} />
                    <div style={{ width: (100 - r.pct) + "%", background: "rgba(255,84,114,0.3)" }} />
                  </div>
                  <div style={{ fontFamily: M, fontSize: 11, fontWeight: 600, width: 38, textAlign: "right", color: r.pct > 70 ? C.pos : r.pct > 50 ? C.warn : C.neg }}>{r.pct.toFixed(0)}%</div>
                  <div style={{ fontFamily: M, fontSize: 10, width: 52, textAlign: "right", color: C.textMute }}>{r.clean}/{r.total}</div>
                </div>
              ));
            })()}
          </Section>

          <Section
            title="Gap vs time loss"
            hint="How close each driver followed (avg gap to the car ahead on dirty laps) vs how much time they lost. Shows at what gap dirty air becomes costly."
          >
            {(() => {
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
                  if (gap < DIRTY_AIR_THRESHOLD) { dd.dirtyTimes.push(lap.lap_duration!); dd.gaps.push(gap); }
                  else { dd.cleanTimes.push(lap.lap_duration!); }
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
          </Section>
        </>
      )}

      {/* ============================ TRACK ============================ */}
      {subTab === "track" && (
        <>
          <Section
            title="Weather correlation"
            hint="Did hotter track temps slow everyone down? Shows how lap times changed with temperature, and which drivers adapted best to shifting conditions."
          >
            <WeatherCorrelation allLaps={allLaps} drivers={drivers} weather={weather} />
          </Section>

          <SuperClipping sessionKey={sessionKey} allLaps={allLaps} drivers={drivers} />

          <div style={sty.card}>
            <RaceReplay sessionKey={sessionKey} drivers={drivers} />
          </div>
        </>
      )}
    </div>
  );
}
