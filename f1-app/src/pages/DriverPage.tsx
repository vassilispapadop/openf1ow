import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { api } from "../lib/api";
import { F, sty } from "../lib/styles";
import { mergeDistance } from "../lib/telemetry";
import { detectClipping, buildDrsZones } from "../lib/clipping";
import { DRIVER_COLORS, DEFAULT_DRIVER_TAB, paths } from "../lib/constants";
import Tab from "../components/Tab";
import Spinner from "../components/Spinner";
import { Chart, DeltaChart } from "../components/TelemetryChart";
import DriverInfoCard from "../components/shell/DriverInfoCard";
import LapsTab from "../components/driver/LapsTab";
import TelemetryTab from "../components/driver/TelemetryTab";
import StintsTab from "../components/driver/StintsTab";
import PositionTab from "../components/driver/PositionTab";
import WeatherTab from "../components/driver/WeatherTab";
import RaceControlTab from "../components/driver/RaceControlTab";
import ResultsTab from "../components/driver/ResultsTab";

export default function DriverPage() {
  const { driverNumber: dnParam, tab } = useParams<{ driverNumber: string; tab: string }>();
  const navigate = useNavigate();
  const { sk, drivers, weather, rc, results, year, mk, setError } = useSession();

  const dn = dnParam || "";
  const currentTab = tab || DEFAULT_DRIVER_TAB;

  const [laps, setLaps] = useState<any[]>([]);
  const [stints, setStints] = useState<any[]>([]);
  const [pits, setPits] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [carData, setCarData] = useState<any[]>([]);
  const [selLap, setSelLap] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [driverLoading, setDriverLoading] = useState("");
  const syncRef = useRef({});

  // Load driver data when driver or session changes
  const loadedRef = useRef("");
  useEffect(() => {
    const key = sk + "-" + dn;
    if (!dn || !sk || loadedRef.current === key) return;
    loadedRef.current = key;
    setCarData([]);
    setSelLap(null);
    // Don't clear comparisons — they persist across driver switches
    // so users can compare laps from different drivers
    setDriverLoading("Loading driver data...");
    Promise.all([
      api("/laps?session_key=" + sk + "&driver_number=" + dn),
      api("/stints?session_key=" + sk + "&driver_number=" + dn).catch(() => []),
      api("/pit?session_key=" + sk + "&driver_number=" + dn).catch(() => []),
      api("/position?session_key=" + sk + "&driver_number=" + dn).catch(() => []),
    ]).then(([l, s, p, pos]) => {
      setLaps(l as any[]);
      setStints(s as any[]);
      setPits(p as any[]);
      setPositions(pos as any[]);
      setDriverLoading("");
    }).catch(e => { setError(e.message); setDriverLoading(""); });
  }, [dn, sk, setError]);

  const fetchTelemetry = useCallback((sessionKey: string, driverNumber: string, lap: any) => {
    const end = new Date(new Date(lap.date_start).getTime() + lap.lap_duration * 1000 + 2000).toISOString();
    const q = "?session_key=" + sessionKey + "&driver_number=" + driverNumber + "&date>=" + lap.date_start + "&date<=" + end;
    return Promise.all([
      api("/car_data" + q),
      api("/location" + q).catch(() => []),
    ]).then(([cd, loc]) => mergeDistance(cd as any[], loc as any[]));
  }, []);

  const loadTel = useCallback((lap: any) => {
    if (!lap.date_start || !lap.lap_duration) return;
    setSelLap(lap.lap_number);
    setDriverLoading("Loading telemetry for lap " + lap.lap_number + "...");
    fetchTelemetry(sk, dn, lap)
      .then(merged => {
        setCarData(merged);
        navigate(paths.driver(year, mk, sk, dn, "telemetry"), { replace: true });
        setDriverLoading("");
      })
      .catch(e => { setError(e.message); setDriverLoading(""); });
  }, [sk, dn, fetchTelemetry, navigate, year, mk, setError]);

  const addComparison = useCallback((driverNumber: string, lap: any, driverInfo: any) => {
    if (!lap.date_start || !lap.lap_duration) return;
    const id = driverNumber + "-" + lap.lap_number;
    setComparisons(prev => {
      if (prev.find((c: any) => c.id === id)) return prev;
      return [...prev, {
        id,
        driverNumber,
        lapNumber: lap.lap_number,
        label: "#" + driverNumber + " " + (driverInfo.name_acronym || driverInfo.full_name) + " L" + lap.lap_number,
        color: DRIVER_COLORS[prev.length % DRIVER_COLORS.length],
        data: [],
        loading: true,
      }];
    });
    fetchTelemetry(sk, driverNumber, lap).then(merged => {
      setComparisons(prev => prev.map((c: any) => c.id === id ? { ...c, data: merged, loading: false } : c));
    }).catch(e => {
      setError(e.message);
      setComparisons(prev => prev.filter((c: any) => c.id !== id));
    });
  }, [sk, fetchTelemetry, setError]);

  const removeComparison = useCallback((id: string) => {
    setComparisons(prev => prev.filter((c: any) => c.id !== id));
  }, []);

  const drv = useMemo(() => drivers.find(d => String(d.driver_number) === String(dn)), [drivers, dn]);
  const best = useMemo(() => laps.reduce((b: any, l: any) => (l.lap_duration && (!b || l.lap_duration < b.lap_duration) ? l : b), null), [laps]);
  const cmpTraces = useMemo(() => comparisons.filter((c: any) => c.data.length > 0).map((c: any) => ({ data: c.data, color: c.color, label: c.label })), [comparisons]);
  const cmpDrsZones = useMemo(() => buildDrsZones(cmpTraces.map(t => t.data)), [cmpTraces]);
  const cmpClipEvents = useMemo(() => cmpTraces.flatMap(t => detectClipping(t.data, cmpDrsZones).map(e => ({ ...e, color: t.color }))), [cmpTraces, cmpDrsZones]);

  if (!drv || !sk) return null;

  if (driverLoading) {
    return <Spinner label={driverLoading} />;
  }

  return (
    <>
      <DriverInfoCard drv={drv} best={best} laps={laps.length} pits={pits.length} onLoadBest={best ? () => loadTel(best) : undefined} onAddBest={best ? () => addComparison(dn, best, drv) : undefined} />

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 12,
        overflowX: "auto",
        flexWrap: "wrap",
        padding: "4px 0",
      }}>
        {([["laps", "Laps & Sectors"], ["telemetry", "Telemetry"], ["stints", "Stints & Pits"], ["position", "Positions"], ["weather", "Weather"], ["rc", "Race Control"], ["results", "Results"]] as const).map(([k, v]) => (
          <Tab key={k} active={currentTab === k} onClick={() => navigate(paths.driver(year, mk, sk, dn, k))}>{v}</Tab>
        ))}
      </div>

      {/* Comparison panel */}
      {comparisons.length > 0 && (
        <div style={sty.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={sty.sectionHead}>COMPARISON</span>
              <span style={{
                background: "#e10600", color: "#fff", fontSize: 10, fontWeight: 700,
                width: 20, height: 20, borderRadius: "50%",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>{comparisons.length}</span>
            </div>
            <button onClick={() => setComparisons([])} style={{
              background: "transparent", color: "#6a6a7e",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
              padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600,
              transition: "all 0.2s ease", fontFamily: F,
            }}>Clear All</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {comparisons.map((c: any) => (
              <span key={c.id} style={{
                background: "rgba(20,20,36,0.8)", borderLeft: "3px solid #" + c.color,
                borderRadius: 8, padding: "6px 12px", fontSize: 12,
                display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#" + c.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                {c.loading ? <span style={{ color: "#5a5a6e", fontSize: 10 }}>loading...</span> : null}
                <button onClick={() => removeComparison(c.id)} style={{
                  background: "rgba(255,255,255,0.06)", border: "none", color: "#6a6a7e",
                  cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1,
                  width: 20, height: 20, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease",
                }}>{"\u2715"}</button>
              </span>
            ))}
          </div>
          {cmpTraces.length > 0 && (
            <div>
              <Chart traces={cmpTraces} syncRef={syncRef} clippingEvents={cmpClipEvents} />
              <DeltaChart traces={cmpTraces} syncRef={syncRef} />
            </div>
          )}
        </div>
      )}

      {/* Tab content */}
      {currentTab === "laps" && (
        <LapsTab laps={laps} best={best} drv={drv} comparisons={comparisons} dn={dn} carData={carData} selLap={selLap} onLoadTel={loadTel} onAddComparison={addComparison} />
      )}
      {currentTab === "telemetry" && (
        <TelemetryTab carData={carData} selLap={selLap} dn={dn} drv={drv} />
      )}
      {currentTab === "stints" && (
        <StintsTab stints={stints} pits={pits} />
      )}
      {currentTab === "position" && (
        <PositionTab positions={positions} />
      )}
      {currentTab === "weather" && (
        <WeatherTab weather={weather} />
      )}
      {currentTab === "rc" && (
        <RaceControlTab rc={rc} />
      )}
      {currentTab === "results" && (
        <ResultsTab results={results} drivers={drivers} dn={dn} />
      )}
    </>
  );
}
