import { useState, useEffect, useCallback, useRef } from "react";
import RaceAnalysis from "./RaceAnalysis";
import { readParams, useUrlState, type UrlParams } from "./lib/useUrlState";
import { api } from "./lib/api";
import { F, sty } from "./lib/styles";
import Tab from "./components/Tab";
import { Chart, DeltaChart } from "./components/TelemetryChart";
import Header from "./components/shell/Header";
import SelectorBar from "./components/shell/SelectorBar";
import DriverInfoCard from "./components/shell/DriverInfoCard";
import Footer from "./components/shell/Footer";
import DriverGrid from "./components/shell/DriverGrid";
import LapsTab from "./components/driver/LapsTab";
import TelemetryTab from "./components/driver/TelemetryTab";
import StintsTab from "./components/driver/StintsTab";
import PositionTab from "./components/driver/PositionTab";
import WeatherTab from "./components/driver/WeatherTab";
import RaceControlTab from "./components/driver/RaceControlTab";
import ResultsTab from "./components/driver/ResultsTab";
import { mergeDistance } from "./lib/telemetry";

// ============================================================================
// APP COMPONENT
// ============================================================================

export default function App() {
  const initParams = useRef(readParams());

  const [year, setYear] = useState(() => initParams.current.year ? Number(initParams.current.year) : 2026);
  const [meetings, setMeetings] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [mk, setMk] = useState("");
  const [sk, setSk] = useState("");
  const [dn, setDn] = useState("");
  const [laps, setLaps] = useState([]);
  const [stints, setStints] = useState([]);
  const [pits, setPits] = useState([]);
  const [positions, setPositions] = useState([]);
  const [carData, setCarData] = useState([]);
  const [weather, setWeather] = useState([]);
  const [rc, setRc] = useState([]);
  const [results, setResults] = useState([]);
  const [selLap, setSelLap] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [tab, setTab] = useState(() => initParams.current.tab || "laps");
  const [showAnalysis, setShowAnalysis] = useState(() => initParams.current.view !== "driver");
  const [subTab, setSubTab] = useState(() => initParams.current.subTab || "pace");
  const [loading, setLoading] = useState("Loading races...");
  const [error, setError] = useState("");
  const syncRef = useRef({});

  const pendingDriverRef = useRef<string>("");

  const loadSession = useCallback((sessionKey, targetDn?: string) => {
    setSk(sessionKey); setDn(""); setDrivers([]); setLaps([]); setCarData([]); setComparisons([]);
    pendingDriverRef.current = targetDn || "";
    if (!sessionKey) return;
    setLoading("Loading drivers...");
    Promise.all([
      api("/drivers?session_key=" + sessionKey),
      api("/weather?session_key=" + sessionKey).catch(() => []),
      api("/race_control?session_key=" + sessionKey).catch(() => []),
      api("/session_result?session_key=" + sessionKey).catch(() => []),
    ]).then(([d, w, r, sr]) => {
      setDrivers(d.sort((a, b) => a.driver_number - b.driver_number));
      setWeather(w); setRc(r); setResults(sr); setLoading("");
    }).catch(e => { setError(e.message); setLoading(""); });
  }, []);

  const loadMeeting = useCallback((meetingKey, autoSelectSession: boolean | string = false, targetDn?: string) => {
    setMk(meetingKey); setSk(""); setDn(""); setSessions([]); setDrivers([]); setLaps([]); setCarData([]); setComparisons([]);
    if (!meetingKey) return;
    setLoading("Loading sessions...");
    api("/sessions?meeting_key=" + meetingKey)
      .then(d => {
        setSessions(d);
        if (typeof autoSelectSession === "string") {
          // Auto-select a specific session key from URL
          const target = d.find(s => String(s.session_key) === autoSelectSession);
          if (target) {
            loadSession(String(target.session_key), targetDn);
          } else {
            setLoading("");
          }
        } else if (autoSelectSession && d.length) {
          const race = d.find(s => s.session_name === "Race") || d[d.length - 1];
          loadSession(String(race.session_key));
        } else {
          setLoading("");
        }
      })
      .catch(e => { setError(e.message); setLoading(""); });
  }, [loadSession]);

  const onYear = useCallback((y, autoLoad: boolean | { mk?: string; sk?: string; dn?: string } = false) => {
    setYear(y);
    setMk(""); setSk(""); setDn(""); setSessions([]); setDrivers([]); setLaps([]); setCarData([]); setComparisons([]);
    setLoading("Loading " + y + " races...");
    api("/meetings?year=" + y)
      .then(d => {
        setMeetings(d);
        if (typeof autoLoad === "object" && autoLoad.mk) {
          // Restore from URL — load specific meeting/session/driver
          loadMeeting(autoLoad.mk, autoLoad.sk || false, autoLoad.dn);
        } else if (autoLoad === true && d.length) {
          const now = new Date();
          const past = d.filter(m => m.date_start && new Date(m.date_start) < now);
          const latest = past.length ? past[past.length - 1] : d[0];
          loadMeeting(String(latest.meeting_key), true);
        } else {
          setLoading("");
        }
      })
      .catch(e => { setError(e.message); setLoading(""); });
  }, [loadMeeting]);

  // Handle browser back/forward
  const { pushState, replaceState, markPopState, clearPopState } = useUrlState((p) => {
    markPopState();
    const y = p.year ? Number(p.year) : 2026;
    setShowAnalysis(p.view !== "driver");
    setTab(p.tab || "laps");
    if (p.subTab) setSubTab(p.subTab);
    if (y !== year) {
      onYear(y, p.mk ? { mk: p.mk, sk: p.sk, dn: p.dn } : true);
    } else if (p.mk && p.mk !== mk) {
      loadMeeting(p.mk, p.sk || false, p.dn);
    } else if (p.sk && p.sk !== sk) {
      loadSession(p.sk, p.dn);
    } else if ((p.dn || "") !== dn) {
      if (p.dn) onDriver(p.dn); else setDn("");
    }
    // Clear after a microtask so the sync effect sees the flag
    Promise.resolve().then(clearPopState);
  });

  // Initial load — restore from URL or auto-select latest
  useEffect(() => {
    const p = initParams.current;
    const y = p.year ? Number(p.year) : 2026;
    if (p.mk) {
      onYear(y, { mk: p.mk, sk: p.sk, dn: p.dn });
    } else {
      onYear(y, true);
    }
  }, []);

  // Sync URL whenever key state changes
  const isInitialLoad = useRef(true);
  useEffect(() => {
    const params: UrlParams = {};
    if (year) params.year = String(year);
    if (mk) params.mk = mk;
    if (sk) params.sk = sk;
    if (dn) params.dn = dn;
    if (!showAnalysis) params.view = "driver";
    if (tab && tab !== "laps") params.tab = tab;
    if (showAnalysis && subTab && subTab !== "pace") params.subTab = subTab;
    if (isInitialLoad.current) {
      replaceState(params);
    } else {
      pushState(params);
    }
  }, [year, mk, sk, dn, showAnalysis, tab, subTab, replaceState, pushState]);

  // Mark initial load as done once loading finishes for the first time
  useEffect(() => {
    if (isInitialLoad.current && !loading) {
      isInitialLoad.current = false;
    }
  }, [loading]);

  const onMeeting = useCallback((v) => {
    loadMeeting(v, true);
  }, [loadMeeting]);

  const onSession = useCallback((v) => {
    loadSession(v);
  }, [loadSession]);

  const onDriver = useCallback((v) => {
    setDn(v); setCarData([]); setSelLap(null); setTab("laps");
    if (!v || !sk) return;
    setLoading("Loading driver data...");
    Promise.all([
      api("/laps?session_key=" + sk + "&driver_number=" + v),
      api("/stints?session_key=" + sk + "&driver_number=" + v).catch(() => []),
      api("/pit?session_key=" + sk + "&driver_number=" + v).catch(() => []),
      api("/position?session_key=" + sk + "&driver_number=" + v).catch(() => []),
    ]).then(([l, s, p, pos]) => {
      setLaps(l); setStints(s); setPits(p); setPositions(pos); setLoading("");
    }).catch(e => { setError(e.message); setLoading(""); });
  }, [sk]);

  // Auto-select pending driver from URL after drivers load
  useEffect(() => {
    if (pendingDriverRef.current && drivers.length && sk) {
      const target = pendingDriverRef.current;
      pendingDriverRef.current = "";
      if (drivers.some(d => String(d.driver_number) === target)) {
        onDriver(target);
      }
    }
  }, [drivers, sk, onDriver]);

  const fetchTelemetry = useCallback((sessionKey, driverNumber, lap) => {
    const end = new Date(new Date(lap.date_start).getTime() + lap.lap_duration * 1000 + 2000).toISOString();
    const q = "?session_key=" + sessionKey + "&driver_number=" + driverNumber + "&date>=" + lap.date_start + "&date<=" + end;
    return Promise.all([
      api("/car_data" + q),
      api("/location" + q).catch(() => []),
    ]).then(([cd, loc]) => mergeDistance(cd, loc));
  }, []);

  const loadTel = useCallback((lap) => {
    if (!lap.date_start || !lap.lap_duration) return;
    setSelLap(lap.lap_number);
    setLoading("Loading telemetry for lap " + lap.lap_number + "...");
    fetchTelemetry(sk, dn, lap)
      .then(merged => { setCarData(merged); setTab("telemetry"); setLoading(""); })
      .catch(e => { setError(e.message); setLoading(""); });
  }, [sk, dn, fetchTelemetry]);

  const addComparison = useCallback((driverNumber, lap, driverInfo) => {
    if (!lap.date_start || !lap.lap_duration) return;
    const id = driverNumber + "-" + lap.lap_number;
    setComparisons(prev => {
      if (prev.find(c => c.id === id)) return prev;
      return [...prev, {
        id,
        driverNumber,
        lapNumber: lap.lap_number,
        label: "#" + driverNumber + " " + (driverInfo.name_acronym || driverInfo.full_name) + " L" + lap.lap_number,
        color: driverInfo.team_colour || "3b82f6",
        data: [],
        loading: true,
      }];
    });
    fetchTelemetry(sk, driverNumber, lap).then(merged => {
      setComparisons(prev => prev.map(c => c.id === id ? { ...c, data: merged, loading: false } : c));
    }).catch(e => {
      setError(e.message);
      setComparisons(prev => prev.filter(c => c.id !== id));
    });
  }, [sk, fetchTelemetry]);

  const removeComparison = useCallback((id) => {
    setComparisons(prev => prev.filter(c => c.id !== id));
  }, []);

  const drv = drivers.find(d => String(d.driver_number) === String(dn));
  const best = laps.reduce((b, l) => (l.lap_duration && (!b || l.lap_duration < b.lap_duration) ? l : b), null);
  const cmpTraces = comparisons.filter(c => c.data.length > 0).map(c => ({ data: c.data, color: c.color, label: c.label }));

  return (
    <div style={sty.bg}>
      {/* Background ambient glow */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "100vh", zIndex: 0, pointerEvents: "none" as const,
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(225,6,0,0.06) 0%, transparent 60%)",
      }} />

      {/* ====== HEADER BAR ====== */}
      <Header meetings={meetings} mk={mk} sessions={sessions} sk={sk} />

      {/* ====== MAIN CONTENT ====== */}
      <div style={{ padding: "20px 28px", position: "relative" as const, zIndex: 1 }}>

        {error && (
          <div style={sty.err}>
            {error}
            <button onClick={() => {
              setError("");
              // Retry from the deepest loaded level
              if (dn && sk) { onDriver(dn); }
              else if (sk) { loadSession(sk); }
              else if (mk) { loadMeeting(mk, true); }
              else { onYear(year, true); }
            }} style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fca5a5",
              cursor: "pointer",
              marginLeft: 12,
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 4,
              fontFamily: F,
            }}>Retry</button>
            <button onClick={() => setError("")} style={{
              background: "none",
              border: "none",
              color: "#fca5a5",
              cursor: "pointer",
              marginLeft: 4,
              fontSize: 14,
              fontWeight: 600,
            }}>{"\u2715"}</button>
          </div>
        )}

        {/* ====== SELECTOR BAR ====== */}
        <SelectorBar meetings={meetings} mk={mk} sessions={sessions} sk={sk} onMeeting={onMeeting} onSession={onSession} />

        {/* ====== DRIVER GRID ====== */}
        {drivers.length > 0 && !loading && (
          <DriverGrid drivers={drivers} dn={dn} onDriver={onDriver} />
        )}

        {/* ====== VIEW TOGGLE (Race Analysis vs Driver View) ====== */}
        {drivers.length > 0 && !loading && (
          <div style={{
            display: "inline-flex",
            gap: 2,
            marginBottom: 16,
            background: "rgba(12,12,24,0.6)",
            borderRadius: 12,
            padding: 3,
            border: "1px solid rgba(255,255,255,0.05)",
            backdropFilter: "blur(12px)",
          }}>
            {[
              { label: "Race Analysis", active: showAnalysis, onClick: () => setShowAnalysis(true) },
              { label: "Driver View", active: !showAnalysis, onClick: () => setShowAnalysis(false) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.onClick} style={{
                padding: "9px 26px",
                border: "none",
                borderRadius: 10,
                background: btn.active
                  ? "linear-gradient(135deg, #e10600 0%, #b80500 100%)"
                  : "transparent",
                color: btn.active ? "#fff" : "#5a5a6e",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: F,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.8px",
                boxShadow: btn.active ? "0 4px 16px rgba(225,6,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
                outline: "none",
              }}>{btn.label}</button>
            ))}
          </div>
        )}

        {loading && (
          <div style={{
            textAlign: "center",
            padding: "80px 20px",
            animation: "fadeIn 0.3s ease-out",
          }}>
            {/* F1-style spinner */}
            <div style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(255,255,255,0.04)",
              borderTopColor: "#e10600",
              borderRightColor: "rgba(225,6,0,0.3)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 18px",
              boxShadow: "0 0 20px rgba(225,6,0,0.1)",
            }} />
            <div style={{
              color: "#6a6a7e",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: F,
              letterSpacing: "0.5px",
              textTransform: "uppercase" as const,
            }}>{loading}</div>
            {/* Shimmer bar */}
            <div style={{
              width: 120,
              height: 2,
              borderRadius: 1,
              margin: "12px auto 0",
              background: "linear-gradient(90deg, transparent 0%, #e10600 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite",
            }} />
          </div>
        )}

        {/* ====== EMPTY STATE HERO ====== */}
        {!loading && !drv && !(showAnalysis && drivers.length > 0 && sk) && (
          <div className="fade-in-up" style={{
            textAlign: "center",
            padding: "80px 20px 60px",
          }}>
            {/* Large watermark */}
            <div style={{
              fontSize: 80,
              fontWeight: 900,
              fontFamily: F,
              lineHeight: 1,
              letterSpacing: "-2px",
              marginBottom: -10,
              userSelect: "none",
            }}>
              <span style={{ color: "rgba(255,255,255,0.03)" }}>Open</span>
              <span style={{ color: "rgba(225,6,0,0.06)" }}>F1</span>
              <span style={{ color: "rgba(255,255,255,0.03)" }}>ow</span>
            </div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: "rgba(255,255,255,0.6)",
              fontFamily: F,
              marginBottom: 8,
            }}>
              {!mk ? "Select a race to begin" : !sk ? "Choose a session" : "Pick a driver to explore"}
            </div>
            <div style={{
              fontSize: 12,
              color: "#5a5a6e",
              maxWidth: 400,
              margin: "0 auto",
              lineHeight: 1.6,
            }}>
              {!mk
                ? "Dive into lap times, telemetry traces, tire strategies, and race analysis from the " + year + " Formula 1 season."
                : !sk
                ? "Select a practice, qualifying, or race session to load driver data."
                : "Choose a driver from the dropdown above, or switch to Race Analysis for full-field insights."
              }
            </div>
            {/* Decorative line */}
            <div style={{
              width: 60,
              height: 3,
              background: "linear-gradient(90deg, transparent, #e10600, transparent)",
              borderRadius: 2,
              margin: "24px auto 0",
            }} />
          </div>
        )}

        {/* ====== RACE ANALYSIS VIEW (always mounted to preserve state) ====== */}
        <div style={{ display: showAnalysis && drivers.length > 0 && sk && !loading ? undefined : "none" }}>
          <div className="fade-in-up">
            <RaceAnalysis sessionKey={sk} drivers={drivers} weather={weather} raceControl={rc} results={results} subTab={subTab} onSubTabChange={setSubTab} />
          </div>
        </div>

        {/* ====== DRIVER VIEW ====== */}
        {!showAnalysis && drv && !loading && (
          <>
            {/* ====== DRIVER INFO CARD ====== */}
            <DriverInfoCard drv={drv} best={best} laps={laps.length} pits={pits.length} />

            {/* ====== TAB BAR ====== */}
            <div style={{
              display: "flex",
              gap: 6,
              marginBottom: 12,
              overflowX: "auto",
              flexWrap: "wrap",
              padding: "4px 0",
            }}>
              {[["laps", "Laps & Sectors"], ["telemetry", "Telemetry"], ["stints", "Stints & Pits"], ["position", "Positions"], ["weather", "Weather"], ["rc", "Race Control"], ["results", "Results"]].map(([k, v]) => (
                <Tab key={k} active={tab === k} onClick={() => setTab(k)}>{v}</Tab>
              ))}
            </div>

            {/* ====== COMPARISON PANEL ====== */}
            {comparisons.length > 0 && (
              <div style={sty.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      ...sty.sectionHead,
                    }}>COMPARISON</span>
                    <span style={{
                      background: "#e10600",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>{comparisons.length}</span>
                  </div>
                  <button onClick={() => setComparisons([])} style={{
                    background: "transparent",
                    color: "#6a6a7e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                  }}>Clear All</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {comparisons.map(c => (
                    <span key={c.id} style={{
                      background: "rgba(20,20,36,0.8)",
                      borderLeft: "3px solid #" + c.color,
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                    }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#" + c.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 600 }}>{c.label}</span>
                      {c.loading ? <span style={{ color: "#5a5a6e", fontSize: 10 }}>loading...</span> : null}
                      <button onClick={() => removeComparison(c.id)} style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "none",
                        color: "#6a6a7e",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 12,
                        lineHeight: 1,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                      }}>{"\u2715"}</button>
                    </span>
                  ))}
                </div>
                {cmpTraces.length > 0 && (
                  <div>
                    <Chart traces={cmpTraces} syncRef={syncRef} />
                    <DeltaChart traces={cmpTraces} syncRef={syncRef} />
                  </div>
                )}
              </div>
            )}

            {/* ====== LAPS TAB ====== */}
            {tab === "laps" && (
              <LapsTab laps={laps} best={best} drv={drv} comparisons={comparisons} dn={dn} carData={carData} selLap={selLap} onLoadTel={loadTel} onAddComparison={addComparison} />
            )}

            {/* ====== TELEMETRY TAB ====== */}
            {tab === "telemetry" && (
              <TelemetryTab carData={carData} selLap={selLap} dn={dn} drv={drv} />
            )}

            {/* ====== STINTS TAB ====== */}
            {tab === "stints" && (
              <StintsTab stints={stints} pits={pits} />
            )}

            {/* ====== POSITION TAB ====== */}
            {tab === "position" && (
              <PositionTab positions={positions} />
            )}

            {/* ====== WEATHER TAB ====== */}
            {tab === "weather" && (
              <WeatherTab weather={weather} />
            )}

            {/* ====== RACE CONTROL TAB ====== */}
            {tab === "rc" && (
              <RaceControlTab rc={rc} />
            )}

            {/* ====== RESULTS TAB ====== */}
            {tab === "results" && (
              <ResultsTab results={results} drivers={drivers} dn={dn} />
            )}
          </>
        )}
      </div>

      {/* ====== FOOTER ====== */}
      <Footer />
    </div>
  );
}
