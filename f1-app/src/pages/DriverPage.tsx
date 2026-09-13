// The driver view: one driver's session over the engine model, comparison
// first. Laps to compare come from any driver in the session, are carried
// in ?cmp=dn-lap,dn-lap (byte-identical to the old codec) and render as a
// synced telemetry stack, a delta trace, the dominance map and the
// corner/curve/straight split.

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { api } from "../lib/api";
import { mergeDistance } from "../lib/telemetry";
import { detectClipping, buildDrsZones } from "../lib/clipping";
import { DRIVER_COLORS, DEFAULT_DRIVER_TAB, paths } from "../lib/constants";
import { C } from "../lib/styles";
import Spinner from "../components/Spinner";
import Pill from "../components/Pill";
import { Section, Segmented } from "../ui";
import DominanceMap from "../components/session/DominanceMap";
import SegmentComparison from "../components/session/SegmentComparison";
import DriverInfoCard from "../components/shell/DriverInfoCard";
import StickyTabBar from "../components/shell/StickyTabBar";
import ModelGate from "../components/insights/ModelGate";
import TelemetryStack from "../components/driver/TelemetryStack";
import CompareBuilder from "../components/driver/CompareBuilder";
import LapsTab from "../components/driver/LapsTab";
import TelemetryTab from "../components/driver/TelemetryTab";
import StintsTab from "../components/driver/StintsTab";
import PositionTab from "../components/driver/PositionTab";
import WeatherTab from "../components/driver/WeatherTab";
import RaceControlTab from "../components/driver/RaceControlTab";
import ResultsTab from "../components/driver/ResultsTab";
import { SessionModelProvider, useSessionModel } from "../lib/useSessionModel";
import { SelectionProvider } from "../contexts/SelectionContext";
import { bestLapFor, topSpeeds, type SessionModel, type EnrichedLap } from "../engine/index.ts";
import type { LapTrace } from "../engine/telemetry/compare.ts";

const TABS = [
  ["laps", "Laps & Sectors"], ["telemetry", "Telemetry"], ["stints", "Stints & Pits"], ["position", "Positions"],
  ["weather", "Weather"], ["rc", "Race Control"], ["results", "Results"],
] as const;
type DriverTab = typeof TABS[number][0];

interface Comparison extends LapTrace {
  driverNumber: number;
  lapNumber: number;
  loading: boolean;
}

export default function DriverPage() {
  const { sk } = useSession();
  return (
    <SessionModelProvider sessionKey={sk}>
      <SelectionProvider resetKey={sk}>
        <ModelGate loading="Loading driver data…">{model => <DriverPageInner model={model} />}</ModelGate>
      </SelectionProvider>
    </SessionModelProvider>
  );
}

function DriverPageInner({ model }: { model: SessionModel }) {
  const { driverNumber: dnParam, tab } = useParams<{ driverNumber: string; tab: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { sk, drivers, rc, results, year, mk, setError } = useSession();
  const { model: liveModel } = useSessionModel();
  void liveModel;

  const dn = dnParam || "";
  const dnNum = Number(dn);
  const currentTab = (tab || DEFAULT_DRIVER_TAB) as DriverTab;
  const d = model.byDriver[dnNum];

  const [carData, setCarData] = useState<any[]>([]);
  const [selLap, setSelLap] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [telLoading, setTelLoading] = useState("");

  // A new driver or session drops the loaded lap; comparisons persist so laps
  // from different drivers can be compared.
  const loadedRef = useRef(sk + "-" + dn);
  useEffect(() => {
    const key = sk + "-" + dn;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    setCarData([]);
    setSelLap(null);
  }, [dn, sk]);

  const fetchTelemetry = useCallback((driverNumber: number | string, lap: EnrichedLap) => {
    const end = new Date(new Date(lap.date_start).getTime() + (lap.lap_duration as number) * 1000 + 2000).toISOString();
    const q = "?session_key=" + sk + "&driver_number=" + driverNumber + "&date>=" + lap.date_start + "&date<=" + end;
    return Promise.all([api("/car_data" + q), api("/location" + q).catch(() => [])]).then(([cd, loc]) => mergeDistance(cd as any[], loc as any[]));
  }, [sk]);

  const loadTel = useCallback((lap: EnrichedLap) => {
    if (!lap.date_start || !lap.lap_duration) return;
    setSelLap(lap.lap_number);
    setTelLoading("Loading telemetry for lap " + lap.lap_number + "…");
    fetchTelemetry(dn, lap)
      .then(merged => { setCarData(merged); navigate(paths.driver(year, mk, sk, dn, "telemetry"), { replace: true }); setTelLoading(""); })
      .catch(e => { setError(e.message); setTelLoading(""); });
  }, [dn, fetchTelemetry, navigate, year, mk, sk, setError]);

  const addComparison = useCallback((driverNumber: number, lap: EnrichedLap) => {
    if (!lap.date_start || !lap.lap_duration) return;
    const info = model.byDriver[driverNumber]?.driver;
    if (!info) return;
    const id = driverNumber + "-" + lap.lap_number;
    setComparisons(prev => {
      if (prev.find(c => c.key === id)) return prev;
      return [...prev, {
        key: id, driverNumber, lapNumber: lap.lap_number,
        label: "#" + driverNumber + " " + info.name_acronym + " L" + lap.lap_number,
        color: DRIVER_COLORS[prev.length % DRIVER_COLORS.length],
        lap: { dateStart: lap.date_start, duration: lap.lap_duration as number },
        data: [], loading: true,
      }];
    });
    fetchTelemetry(driverNumber, lap)
      .then(merged => setComparisons(prev => prev.map(c => (c.key === id ? { ...c, data: merged, loading: false } : c))))
      .catch(e => { setError(e.message); setComparisons(prev => prev.filter(c => c.key !== id)); });
  }, [model, fetchTelemetry, setError]);

  const removeComparison = useCallback((id: string) => setComparisons(prev => prev.filter(c => c.key !== id)), []);

  // Restore ?cmp=dn-lap,dn-lap once; laps come from the model, no fetch.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const cmp = new URLSearchParams(location.search).get("cmp");
    if (!cmp) return;
    const pairs = cmp.split(",").map(s => s.split("-")).filter(p => p.length === 2 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]));
    for (const [drvNum, lapNumStr] of pairs) {
      const lap = model.byDriver[Number(drvNum)]?.laps.find(l => l.lap_number === Number(lapNumStr));
      if (lap) addComparison(Number(drvNum), lap);
    }
    // location.search intentionally omitted — restore once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, addComparison]);

  // Comparisons → URL, after the restore so a pasted link is not overwritten.
  useEffect(() => {
    if (!restoredRef.current) return;
    const params = new URLSearchParams(location.search);
    const cmpStr = comparisons.map(c => `${c.driverNumber}-${c.lapNumber}`).join(",");
    if (cmpStr) params.set("cmp", cmpStr); else params.delete("cmp");
    const next = params.toString();
    const target = next ? `${location.pathname}?${next}` : location.pathname;
    if (`${location.pathname}${location.search}` !== target) navigate(target, { replace: true });
  }, [comparisons, navigate, location.pathname, location.search]);

  const best = useMemo(() => (d ? bestLapFor(model, dnNum) : null), [model, d, dnNum]);
  const topSpeed = useMemo(() => { const r = topSpeeds(model); return r.ok ? r.value.drivers.find(x => x.driver.driver_number === dnNum)?.trap ?? null : null; }, [model, dnNum]);

  // Landing on Telemetry loads the best lap once per driver/session.
  const autoTelRef = useRef("");
  useLayoutEffect(() => {
    if (currentTab !== "telemetry" || !best || carData.length || telLoading) return;
    const key = sk + "-" + dn;
    if (autoTelRef.current === key) return;
    autoTelRef.current = key;
    loadTel(best);
  }, [currentTab, best, carData.length, telLoading, sk, dn, loadTel]);

  const cmpTraces = useMemo(() => comparisons.filter(c => c.data.length > 0), [comparisons]);
  const cmpDrsZones = useMemo(() => buildDrsZones(cmpTraces.map(t => t.data)), [cmpTraces]);
  const cmpClipEvents = useMemo(() => cmpTraces.flatMap(t => detectClipping(t.data, cmpDrsZones).map(e => ({ ...e, color: t.color }))), [cmpTraces, cmpDrsZones]);
  const cmpIds = useMemo(() => new Set(comparisons.map(c => c.key)), [comparisons]);

  if (!d || !sk) return <div style={{ color: C.textMute, fontSize: 13, padding: 24 }}>Driver #{dn} did not take part in this session.</div>;

  return (
    <>
      <DriverInfoCard drv={d.driver} best={best} laps={d.laps.length} pits={d.pits.length} topSpeed={topSpeed} onLoadBest={best ? () => loadTel(best) : undefined} onAddBest={best ? () => addComparison(dnNum, best) : undefined} />

      <StickyTabBar>
        <div style={{ overflowX: "auto" }}>
          <Segmented ariaLabel="Driver view" options={TABS.map(([k, v]) => ({ key: k, label: v }))} value={currentTab} onChange={k => navigate(paths.driver(year, mk, sk, dn, k))} />
        </div>
      </StickyTabBar>

      <Section
        id="comparison"
        kicker={comparisons.length ? `${comparisons.length} lap${comparisons.length === 1 ? "" : "s"}` : undefined}
        title="Lap comparison"
        hint="Any laps from any drivers in this session, by distance round the lap: speed, throttle, brake, gear and DRS on one crosshair, the time delta to the fastest, who was quickest through each stretch of track, and where the time went — corners, fast curves or straights."
        method={{ summary: "Car data (~3.7 Hz) merged with GPS location and aligned by distance from the lap's start; the delta is elapsed time behind the fastest lap at each of 400 points, smoothed over five points to take out sampling jitter. Fast curves are stretches the track turns but a modern car takes at or near full throttle." }}
        actions={comparisons.length ? <Pill size="sm" onClick={() => setComparisons([])}>Clear all</Pill> : undefined}
        share={cmpTraces.length ? { meta: "lap comparison", filename: "openf1ow-comparison" } : undefined}
      >
        <CompareBuilder model={model} currentDn={dnNum} existing={cmpIds} onAdd={addComparison} />
        {comparisons.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 14px" }}>
            {comparisons.map(c => (
              <span key={c.key} style={{ background: C.surfaceAlt, borderLeft: "3px solid #" + c.color, border: "1px solid " + C.border, borderLeftWidth: 3, borderLeftColor: "#" + c.color, borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#" + c.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                {c.loading && <span style={{ color: C.textMute, fontSize: 10 }}>loading…</span>}
                <button onClick={() => removeComparison(c.key)} aria-label={`Remove ${c.label}`} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: C.textMute, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, width: 20, height: 20, borderRadius: "50%" }}>×</button>
              </span>
            ))}
          </div>
        )}
        {cmpTraces.length > 0 && (
          <>
            <TelemetryStack traces={cmpTraces} clippingEvents={cmpClipEvents} />
            {cmpTraces.length >= 2 && (
              <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Dominance map</span>
                    <span style={{ fontSize: 11, color: C.textMute }}>who was faster <em>through</em> each stretch</span>
                  </div>
                  <DominanceMap traces={cmpTraces} height={420} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Corners, curves and straights</span>
                    <span style={{ fontSize: 11, color: C.textMute }}>where the lap time was won and lost</span>
                  </div>
                  <SegmentComparison traces={cmpTraces} />
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {telLoading ? <Spinner label={telLoading} /> : (
        <>
          {currentTab === "laps" && <LapsTab d={d} best={best} comparisons={cmpIds} selLap={selLap} onLoadTel={loadTel} onAddComparison={l => addComparison(dnNum, l)} />}
          {currentTab === "telemetry" && <TelemetryTab carData={carData} selLap={selLap} dn={dn} drv={d.driver} />}
          {currentTab === "stints" && <StintsTab stints={d.stints} pits={d.pits} />}
          {currentTab === "position" && <PositionTab model={model} d={d} />}
          {currentTab === "weather" && <WeatherTab model={model} />}
          {currentTab === "rc" && <RaceControlTab rc={rc} />}
          {currentTab === "results" && <ResultsTab results={results} drivers={drivers} dn={dn} />}
        </>
      )}
    </>
  );
}
