import { useState, useMemo } from "react";
import AIAnalysis from "./components/AIAnalysis";
import RaceReplay from "./components/RaceReplay";
import type { Driver, Lap, Stint, Pit, Weather } from "./lib/types";
import {
  median, computeSlowLapThreshold, isCleanLap,
  fuelCorrPerLap, stintDegradation,
} from "./lib/raceUtils";
import { F, M, C, sty } from "./lib/styles";
import { ft3, podiumColor } from "./lib/format";
import { TC, ANALYSIS_VIEWS, type ViewKey } from "./lib/constants";
import Pill from "./components/Pill";
import ScatterPlot from "./components/analysis/ScatterPlot";
import type { ScatterPoint } from "./components/analysis/useTooltip";
import { PendingData } from "./components/analysis/PendingData";
import RacePaceRanking from "./components/analysis/RacePaceRanking";
import StintDegradation from "./components/analysis/StintDegradation";
import TeammateDelta from "./components/analysis/TeammateDelta";
import ConstructorPace from "./components/analysis/ConstructorPace";
import SectorAnalysis from "./components/analysis/SectorAnalysis";
import FuelVisualization from "./components/analysis/FuelVisualization";
import WeatherCorrelation from "./components/analysis/WeatherCorrelation";
import SuperClipping from "./components/analysis/SuperClipping";
import StickyTabBar from "./components/shell/StickyTabBar";
import { Section, Segmented } from "./ui";
import { useSessionModel } from "./lib/useSessionModel";
import { useSelection } from "./contexts/SelectionContext";
import { buildFacts } from "./engine/index.ts";
import Verdicts, { KpiRow } from "./components/insights/Verdicts";
import TruePaceCard from "./components/insights/TruePaceCard";
import DeltaTraceCard from "./components/insights/DeltaTraceCard";
import LapEvolutionCard from "./components/insights/LapEvolutionCard";
import { StrategyTimelineCard, UndercutCard, TyreLifeCard, PitCrewCard } from "./components/insights/StrategyCards";
import { TeammatesCard, OvertakesCard, SCImpactCard, DirtyAirCard } from "./components/insights/BattlesCards";
import { StartCard, GridFinishCard } from "./components/insights/OverviewCards";

const EMPTY_LAPS: Lap[] = [];

const VIEW_OPTIONS = [{ key: "list", label: "List" }, { key: "graph", label: "Graph" }] as const;

export default function RaceAnalysis({ sessionKey, drivers, weather, raceControl = [], results = [], raceMeta, subTab, onSubTabChange }: {
  sessionKey: string;
  drivers: Driver[];
  weather: Weather[];
  raceControl?: any[];
  results?: any[];
  raceMeta?: { meetingName?: string; circuit?: string; country?: string; year?: number; sessionName?: string };
  subTab: ViewKey;
  onSubTabChange: (tab: ViewKey) => void;
}) {
  // Everything comes from the engine's SessionModel (one bundle fetch per
  // session); the legacy cards still take raw laps/stints/pits, and an
  // EnrichedLap is a Lap, so they read straight off the model.
  const { model, status, error: modelError, pendingCount, retry } = useSessionModel();
  const sel = useSelection();
  const allLaps: Lap[] = model?.laps ?? EMPTY_LAPS;
  const allStints: Stint[] = useMemo(() => (model ? model.drivers.flatMap(d => d.stints) : []), [model]);
  const allPits: Pit[] = useMemo(() => (model ? model.drivers.flatMap(d => d.pits) : []), [model]);
  // One list|graph toggle per card — the old single state flipped three
  // unrelated sections at once, across tab boundaries.
  const [paceView, setPaceView] = useState<"list" | "graph">("graph");
  const [degView, setDegView] = useState<"list" | "graph">("graph");
  const [teamView, setTeamView] = useState<"list" | "graph">("graph");

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
  const sharedTeams = useMemo(() => {
    const m: Record<string, { drivers: Driver[]; color: string }> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!m[t]) m[t] = { drivers: [], color: d.team_colour || "666" };
      m[t].drivers.push(d);
    });
    return m;
  }, [drivers]);

  // Clean-lap durations per driver. Feeds pace consistency + best-vs-median.
  const cleanByDriver = useMemo(() => {
    const m: Record<number, number[]> = {};
    allLaps.forEach(l => {
      if (!isCleanLap(l, sharedThreshold)) return;
      (m[l.driver_number] ||= []).push(l.lap_duration!);
    });
    return m;
  }, [allLaps, sharedThreshold]);

  // Per-stint fuel-corrected degradation. Feeds compound-summary + stint-vs-deg.
  const stintStats = useMemo(() => {
    const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
    const fuelCorr = fuelCorrPerLap(totalRaceLaps);
    return allStints.map(st => {
      const res = stintDegradation(st, sharedLapLookup, sharedThreshold, fuelCorr);
      return res ? { stint: st, deg: res.deg, usable: res.usable } : null;
    }).filter(Boolean) as { stint: Stint; deg: number; usable: Lap[] }[];
  }, [allLaps, allStints, sharedLapLookup, sharedThreshold]);


  if (status === "pending") {
    return <PendingData onRetry={retry} checking={false} exhausted={pendingCount > 4} />;
  }
  if (status === "idle" || status === "loading" || !model) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 36, color: C.textDim, fontSize: 13 }}>Loading session data…</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div style={sty.err}>
        <span style={{ flex: 1 }}>{modelError}</span>
        <button onClick={retry} style={{
          background: "none", border: "none", color: "inherit",
          cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 4,
        }}>Retry</button>
      </div>
    );
  }

  const exportJson = () => {
    // The same facts the verdicts and the AI narrative are built from.
    const facts = buildFacts(model);
    const blob = new Blob([JSON.stringify(facts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "race-analysis-" + sessionKey + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <KpiRow onOpenTab={onSubTabChange} />

      <StickyTabBar>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <Segmented
            ariaLabel="Analysis view"
            options={ANALYSIS_VIEWS.map(v => ({ key: v.key, label: v.label }))}
            value={subTab}
            onChange={onSubTabChange}
          />
          {sel.selected.size > 0 && model && (
            <div style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }} aria-label="Selected drivers">
              {[...sel.selected].map(dn => {
                const d = model.byDriver[dn];
                return d ? (
                  <Pill key={dn} size="sm" active onClick={() => sel.toggle(dn)} title="Remove from selection">
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#" + (d.driver.team_colour || "666") }} />
                    {d.driver.name_acronym} ×
                  </Pill>
                ) : null;
              })}
              <Pill size="sm" onClick={sel.clear} title="Clear selection">clear</Pill>
            </div>
          )}
          <Pill size="sm" onClick={exportJson} title="Download race analysis data as JSON">
            Export JSON
          </Pill>
        </div>
      </StickyTabBar>

      {subTab === "overview" && (
        <>
          <Verdicts onOpenTab={onSubTabChange} />
          <StartCard />
          <GridFinishCard />
        <AIAnalysis
          key={sessionKey}
          allLaps={allLaps}
          drivers={drivers}
          stints={allStints}
          pits={allPits}
          weather={weather}
          raceControl={raceControl}
          results={results}
          raceMeta={raceMeta}
        />        </>

      )}

      {subTab === "pace" && (
        <>
          <Verdicts area="pace" onOpenTab={onSubTabChange} />
          <TruePaceCard />
          <Section
            title="Lap-time distribution"
            hint="Who was genuinely fastest on track? Each driver's median lap time on clean racing laps — slow laps (safety car, traffic, mistakes) filtered out."
            actions={<Segmented size="sm" role="radiogroup" ariaLabel="List or graph" options={VIEW_OPTIONS} value={paceView} onChange={setPaceView} />}
          >
            <RacePaceRanking allLaps={allLaps} drivers={drivers} viewMode={paceView} />
          </Section>

          <Section
            title="Pace consistency"
            hint="Standard deviation of clean lap times — lower = more metronomic. A consistent driver extracts more from their car over a race distance."
          >
            {(() => {
              const rows = drivers.map(d => {
                const clean = cleanByDriver[d.driver_number] || [];
                if (clean.length < 5) return null;
                const mean = clean.reduce((s, t) => s + t, 0) / clean.length;
                const stdDev = Math.sqrt(clean.reduce((s, t) => s + (t - mean) ** 2, 0) / clean.length);
                const totalLaps = (sharedLapMap[d.driver_number] || []).length;
                const cleanPct = (clean.length / totalLaps) * 100;
                return { driver: d, color: d.team_colour || "666", stdDev, cleanPct };
              }).filter((r): r is NonNullable<typeof r> => r !== null);
              rows.sort((a, b) => a.stdDev - b.stdDev);
              if (!rows.length) return null;
              const maxStd = Math.max(...rows.map(r => r.stdDev));
              return (
                <div>
                  {rows.map((r, i) => {
                    const barColor = r.stdDev < 0.3 ? C.posDim : r.stdDev < 0.6 ? C.warnDim : C.negBar;
                    const textColor = r.stdDev < 0.3 ? C.pos : r.stdDev < 0.6 ? C.warn : C.neg;
                    return (
                      <div key={r.driver.driver_number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 22, textAlign: "right", fontWeight: 700, fontSize: 11, color: podiumColor(i), fontFamily: F }}>{i + 1}</div>
                        <div style={{ width: 44, fontWeight: 600, fontSize: 12, fontFamily: F, color: "#" + r.color }}>{r.driver.name_acronym}</div>
                        <div style={{ flex: 1, position: "relative", height: 16 }}>
                          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 16, borderRadius: 3, background: "rgba(255,255,255,0.03)" }} />
                          <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(2, (r.stdDev / maxStd) * 100) + "%", height: 16, borderRadius: 3, background: barColor }} />
                        </div>
                        <div style={{ fontFamily: M, fontSize: 11, fontWeight: 600, width: 48, textAlign: "right", color: textColor }}>{r.stdDev.toFixed(3)}s</div>
                        <div style={{ fontFamily: M, fontSize: 10, width: 52, textAlign: "right", color: C.textMute }}>{r.cleanPct.toFixed(0)}% clean</div>
                      </div>
                    );
                  })}
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
                const clean = cleanByDriver[d.driver_number] || [];
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

          <LapEvolutionCard />
          <DeltaTraceCard />
        </>
      )}

      {subTab === "strategy" && (
        <>
          <Verdicts area="strategy" onOpenTab={onSubTabChange} />
          <StrategyTimelineCard />
          <UndercutCard />
          <TyreLifeCard />
          <Section
            title="Tire degradation by stint"
            hint="How much slower does each driver get per lap on each compound? Fuel-corrected (lighter car = faster, so raw times understate true tire wear). First 2 laps of each stint excluded (cold tires)."
            actions={<Segmented size="sm" role="radiogroup" ariaLabel="List or graph" options={VIEW_OPTIONS} value={degView} onChange={setDegView} />}
          >
            <StintDegradation allLaps={allLaps} drivers={drivers} stints={allStints} viewMode={degView} />
          </Section>

          <Section
            title="Compound performance summary"
            hint="Average degradation and stint length by tire compound across all drivers — which compound was fastest and which lasted longest."
          >
            {(() => {
              const compoundStats: Record<string, { degs: number[]; paces: number[]; stintLens: number[]; count: number }> = {};
              stintStats.forEach(({ stint: st, deg, usable }) => {
                const c = st.compound;
                const entry = compoundStats[c] ||= { degs: [], paces: [], stintLens: [], count: 0 };
                entry.degs.push(deg);
                entry.paces.push(median(usable.map(l => l.lap_duration!)));
                entry.stintLens.push(st.lap_end - st.lap_start + 1);
                entry.count++;
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
              const pts: ScatterPoint[] = [];
              const drvMap: Record<number, Driver> = {};
              drivers.forEach(d => { drvMap[d.driver_number] = d; });
              stintStats.forEach(({ stint: st, deg }) => {
                const drv = drvMap[st.driver_number];
                if (!drv) return;
                const compColor = TC[st.compound]?.replace("#", "") || drv.team_colour || "666";
                pts.push({ x: st.lap_end - st.lap_start + 1, y: deg, color: compColor, label: drv.name_acronym });
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
          <PitCrewCard />



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

      {subTab === "battles" && (
        <>
          <Verdicts area="battles" onOpenTab={onSubTabChange} />
          <TeammatesCard />
          <OvertakesCard />
          <SCImpactCard />
          <DirtyAirCard />
          <Section
            title="Teammate pace"
            hint="Same car, different drivers — who was faster? Compares teammates on laps where both set a clean time, isolating driver vs. car."
          >
            <TeammateDelta allLaps={allLaps} drivers={drivers} />
          </Section>


          <Section
            title="Constructor pace"
            hint="Which team had the fastest car? Both drivers' laps combined into a single team pace, with individual breakdowns showing each driver's contribution."
            actions={<Segmented size="sm" role="radiogroup" ariaLabel="List or graph" options={VIEW_OPTIONS} value={teamView} onChange={setTeamView} />}
          >
            <ConstructorPace allLaps={allLaps} drivers={drivers} viewMode={teamView} />
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
                    <div style={{ position: "absolute", top: 0, left: 0, width: Math.max(4, maxGap > 0 ? (g.gap / maxGap) * 100 : 0) + "%", height: 18, borderRadius: 4, background: g.gap < 0.1 ? C.posDim : g.gap < 0.3 ? C.warnDim : C.negBar }} />
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



        </>
      )}

      {subTab === "track" && (
        <>
          <Verdicts area="track" onOpenTab={onSubTabChange} />
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
