import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, C, sty } from "../../lib/styles";
import { api } from "../../lib/api";
import { mergeDistance } from "../../lib/telemetry";
import { computeSlowLapThreshold, isCleanLap } from "../../lib/raceUtils";
import { ft3 } from "../../lib/format";
import {
  buildLapSeries, compareLaps, drivingMetrics, miniSectors,
  type TeleSample, type Comparison,
} from "../../lib/deltaTime";
import ShareButton from "../ShareButton";

interface LoadedLap {
  lap: Lap;
  series: TeleSample[];
}

// Distance formatter shared by the axes.
const fmtDist = (d: number) => d >= 1000 ? (d / 1000).toFixed(1) + "km" : Math.round(d) + "m";

export default function CoachingComparison({ sessionKey, allLaps, drivers }: {
  sessionKey: string;
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const threshold = useMemo(() => computeSlowLapThreshold(allLaps), [allLaps]);

  // Fastest clean lap per driver — the reference lap we coach against.
  const fastestByDriver = useMemo(() => {
    const m: Record<number, Lap> = {};
    for (const l of allLaps) {
      if (!isCleanLap(l, threshold)) continue;
      const cur = m[l.driver_number];
      if (!cur || l.lap_duration! < cur.lap_duration!) m[l.driver_number] = l;
    }
    return m;
  }, [allLaps, threshold]);

  // Drivers that actually have a fastest clean lap, ordered fastest-first.
  const rankedDrivers = useMemo(() => {
    return drivers
      .filter(d => fastestByDriver[d.driver_number])
      .sort((a, b) =>
        fastestByDriver[a.driver_number].lap_duration! -
        fastestByDriver[b.driver_number].lap_duration!);
  }, [drivers, fastestByDriver]);

  const [aNum, setANum] = useState<number | null>(null);
  const [bNum, setBNum] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<number, LoadedLap>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  // Default to the two fastest distinct drivers once data arrives.
  useEffect(() => {
    if (aNum == null && rankedDrivers.length >= 1) setANum(rankedDrivers[0].driver_number);
    if (bNum == null && rankedDrivers.length >= 2) setBNum(rankedDrivers[1].driver_number);
  }, [rankedDrivers, aNum, bNum]);

  const drvMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  const fetchSeries = useCallback(async (dn: number): Promise<LoadedLap | null> => {
    const lap = fastestByDriver[dn];
    if (!lap || !lap.date_start || !lap.lap_duration) return null;
    // Normalise both bounds to ISO-Z. The raw OpenF1 date_start carries a
    // "+00:00" offset whose "+" decodes as a space in a query string, which the
    // API rejects with HTTP 422.
    const startMs = new Date(lap.date_start).getTime();
    const start = new Date(startMs).toISOString();
    const end = new Date(startMs + lap.lap_duration * 1000 + 2000).toISOString();
    const q = `?session_key=${sessionKey}&driver_number=${dn}&date>=${start}&date<=${end}`;
    const [cd, loc] = await Promise.all([
      api("/car_data" + q),
      api("/location" + q).catch(() => []),
    ]);
    const series = buildLapSeries(mergeDistance(cd, loc), lap.date_start);
    return { lap, series };
  }, [sessionKey, fastestByDriver]);

  // Load telemetry for whichever pair is selected (cached per driver).
  useEffect(() => {
    if (aNum == null || bNum == null) return;
    const need = [aNum, bNum].filter(n => !loaded[n]);
    if (!need.length) return;
    let stale = false;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const results = await Promise.all(need.map(fetchSeries));
        if (stale) return;
        const next: Record<number, LoadedLap> = {};
        need.forEach((n, i) => { if (results[i]) next[n] = results[i]!; });
        setLoaded(prev => ({ ...prev, ...next }));
      } catch (e: any) {
        if (!stale) setErr(e?.message || "Could not load telemetry for this comparison.");
      } finally {
        if (!stale) setLoading(false);
      }
    })();
    return () => { stale = true; };
  }, [aNum, bNum, loaded, fetchSeries]);

  const A = aNum != null ? loaded[aNum] : null;
  const B = bNum != null ? loaded[bNum] : null;
  const drvA = aNum != null ? drvMap[aNum] : null;
  const drvB = bNum != null ? drvMap[bNum] : null;

  const cmp: Comparison | null = useMemo(() => {
    if (!A || !B) return null;
    return compareLaps(A.series, B.series);
  }, [A, B]);

  const sectors = useMemo(() => cmp ? miniSectors(cmp, 12) : [], [cmp]);
  const metricsA = useMemo(() => A ? drivingMetrics(A.series) : null, [A]);
  const metricsB = useMemo(() => B ? drivingMetrics(B.series) : null, [B]);

  const colA = "#" + (drvA?.team_colour || "e10600");
  // Teammates share a colour; give B a distinct hue so the overlay reads clearly.
  const sameColour = drvA && drvB && drvA.team_colour === drvB.team_colour;
  const colB = sameColour ? C.violet : "#" + (drvB?.team_colour || "0072C6");

  const swap = () => { setANum(bNum); setBNum(aNum); };

  const DriverSelect = ({ value, onChange, label }: {
    value: number | null; onChange: (n: number) => void; label: string;
  }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 130 }}>
      <span style={{ fontSize: 10, color: C.textMute, fontWeight: 600, letterSpacing: "0.03em" }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={e => onChange(Number(e.target.value))}
        style={{ ...sty.sel, padding: "8px 30px 8px 12px", fontSize: 13 }}
      >
        {rankedDrivers.map((d, i) => (
          <option key={d.driver_number} value={d.driver_number}>
            {i + 1}. {d.name_acronym} · {ft3(fastestByDriver[d.driver_number].lap_duration!)}
          </option>
        ))}
      </select>
    </label>
  );

  if (rankedDrivers.length < 2) {
    return (
      <div style={{ ...sty.card, textAlign: "center", padding: 36, color: C.textDim, fontSize: 13 }}>
        Not enough clean-lap telemetry yet to compare two drivers.
      </div>
    );
  }

  // ---- Geometry for the SVG traces (shared x = distance) ----
  const W = 1000;
  const maxAbs = cmp ? Math.max(0.05, ...cmp.deltaT.map(v => Math.abs(v))) : 1;
  const DELTA_H = 220, DZERO = DELTA_H / 2, DSCALE = (DELTA_H / 2 - 14) / maxAbs;
  const SPEED_H = 190;
  const maxSpeed = cmp ? Math.max(...cmp.speedA, ...cmp.speedB, 1) : 1;
  const minSpeed = cmp ? Math.min(...cmp.speedA, ...cmp.speedB) : 0;
  const spSpan = Math.max(1, maxSpeed - minSpeed);

  const xOf = (d: number) => cmp ? (d / cmp.maxD) * (W - 8) + 4 : 0;

  // Display-only smoothing: the two laps' GPS-integrated distance axes don't
  // align perfectly, so the raw per-point delta jitters. A small moving average
  // makes the trace readable without touching the headline gap or sector math
  // (both computed from raw deltaT).
  const deltaSmooth = cmp ? smooth(cmp.deltaT, 4) : [];

  const deltaLine = cmp
    ? cmp.grid.map((d, i) => `${xOf(d).toFixed(1)},${(DZERO + deltaSmooth[i] * DSCALE).toFixed(1)}`).join(" ")
    : "";
  const deltaArea = cmp
    ? `${xOf(cmp.grid[0]).toFixed(1)},${DZERO} ` + deltaLine +
      ` ${xOf(cmp.grid[cmp.grid.length - 1]).toFixed(1)},${DZERO}`
    : "";
  const speedPath = (arr: number[]) => {
    if (!cmp) return "";
    const sm = smooth(arr, 2);
    return sm.map((s, i) => `${xOf(cmp.grid[i]).toFixed(1)},${(SPEED_H - 8 - ((s - minSpeed) / spSpan) * (SPEED_H - 16)).toFixed(1)}`).join(" ");
  };

  const maxSectorAbs = Math.max(0.001, ...sectors.map(s => Math.abs(s.delta)));

  return (
    <div ref={cardRef}>
      {/* ---- Controls ---- */}
      <div style={{ ...sty.card, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <DriverSelect value={aNum} onChange={setANum} label="REFERENCE DRIVER" />
          <button
            onClick={swap}
            title="Swap drivers"
            style={{
              background: C.surfaceAlt, color: C.textDim, border: "1px solid " + C.border,
              borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 14, lineHeight: 1,
              fontFamily: F, marginBottom: 1,
            }}
          >⇄</button>
          <DriverSelect value={bNum} onChange={setBNum} label="COMPARE DRIVER" />
          <div style={{ marginLeft: "auto", marginBottom: 1 }}>
            <ShareButton domRef={cardRef} filename="openf1ow-delta-time" />
          </div>
        </div>
        {drvA && drvB && (
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <LegendChip color={colA} dash={false} label={drvA.name_acronym} />
            <LegendChip color={colB} dash label={drvB.name_acronym} />
            <span style={{ fontSize: 11, color: C.textFaint, fontFamily: M }}>
              fastest clean lap · {drvA.name_acronym} {ft3(A?.lap.lap_duration ?? 0)} vs {drvB.name_acronym} {ft3(B?.lap.lap_duration ?? 0)}
            </span>
          </div>
        )}
      </div>

      {err && <div style={sty.err}><span style={{ flex: 1 }}>{err}</span></div>}

      {loading && !cmp && (
        <div style={{ ...sty.card, textAlign: "center", padding: 40, color: C.textDim, fontSize: 13, fontFamily: M }}>
          Loading telemetry…
        </div>
      )}

      {!loading && !cmp && !err && (
        <div style={{ ...sty.card, textAlign: "center", padding: 36, color: C.textDim, fontSize: 13 }}>
          Telemetry isn't available for one of these laps.
        </div>
      )}

      {cmp && drvA && drvB && (
        <>
          {/* ---- Headline gap (authoritative: true lap_duration delta) ---- */}
          {(() => {
            const gap = (B!.lap.lap_duration! - A!.lap.lap_duration!);
            const bFaster = gap < 0;
            return (
              <div style={{ ...sty.card, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 18px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: colB }}>{drvB.name_acronym}</span>
                <span style={{
                  fontFamily: M, fontSize: 26, fontWeight: 700,
                  color: bFaster ? C.pos : C.neg,
                }}>
                  {bFaster ? "−" : "+"}{Math.abs(gap).toFixed(3)}s
                </span>
                <span style={{ fontSize: 12, color: C.textMute }}>
                  {bFaster ? "faster than" : "slower than"} {drvA.name_acronym} over one lap
                </span>
              </div>
            );
          })()}

          {/* ---- Delta-time trace ---- */}
          <div style={sty.card}>
            <h3 style={{ ...sty.sectionHead, marginBottom: 6 }}>Delta-time trace</h3>
            <p style={{ fontSize: 12, color: C.textMute, margin: "0 0 12px", lineHeight: 1.55, maxWidth: 760 }}>
              Cumulative time gap down the lap. When the line dips into <span style={{ color: C.pos }}>green</span>, {drvB.name_acronym} is
              gaining on {drvA.name_acronym}; when it climbs into <span style={{ color: C.neg }}>red</span>, {drvB.name_acronym} is losing.
              The slope shows <em>where</em> — the steeper it moves, the more time changes hands.
            </p>
            <svg viewBox={`0 0 ${W} ${DELTA_H}`} width="100%" style={{ display: "block" }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="deltaFill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={DELTA_H}>
                  <stop offset="0" stopColor={C.pos} stopOpacity="0.28" />
                  <stop offset="0.5" stopColor={C.pos} stopOpacity="0.05" />
                  <stop offset="0.5" stopColor={C.neg} stopOpacity="0.05" />
                  <stop offset="1" stopColor={C.neg} stopOpacity="0.28" />
                </linearGradient>
              </defs>
              {/* zero line */}
              <line x1="0" y1={DZERO} x2={W} y2={DZERO} stroke={C.borderStrong} strokeWidth="1" strokeDasharray="4 4" />
              <polygon points={deltaArea} fill="url(#deltaFill)" />
              <polyline points={deltaLine} fill="none" stroke={colB} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: M }}>start/finish</span>
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: M }}>{fmtDist(cmp.maxD)}</span>
            </div>
          </div>

          {/* ---- Mini-sector gain/loss ---- */}
          <div style={sty.card}>
            <h3 style={{ ...sty.sectionHead, marginBottom: 6 }}>Where the lap was made</h3>
            <p style={{ fontSize: 12, color: C.textMute, margin: "0 0 12px", lineHeight: 1.55, maxWidth: 760 }}>
              The lap split into 12 equal-distance mini-sectors. Each bar is the time {drvB.name_acronym} gained
              (<span style={{ color: C.pos }}>green, down</span>) or lost (<span style={{ color: C.neg }}>red, up</span>) versus {drvA.name_acronym} in that stretch.
            </p>
            <svg viewBox={`0 0 ${W} 130`} width="100%" style={{ display: "block" }} preserveAspectRatio="none">
              <line x1="0" y1="65" x2={W} y2="65" stroke={C.borderStrong} strokeWidth="1" />
              {sectors.map((s) => {
                const x0 = xOf(s.dStart), x1 = xOf(s.dEnd);
                const h = (Math.abs(s.delta) / maxSectorAbs) * 52;
                const up = s.delta > 0; // B lost time → red bar upward
                return (
                  <g key={s.index}>
                    <rect
                      x={x0 + 3} y={up ? 65 - h : 65}
                      width={Math.max(1, x1 - x0 - 6)} height={Math.max(0.5, h)}
                      rx="2" fill={up ? C.neg : C.pos} opacity="0.85"
                    />
                    <text x={(x0 + x1) / 2} y="80" fontSize="9" fill={C.textFaint} textAnchor="middle" fontFamily={M}>{s.index}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ---- Speed overlay ---- */}
          <div style={sty.card}>
            <h3 style={{ ...sty.sectionHead, marginBottom: 6 }}>Speed trace overlay</h3>
            <p style={{ fontSize: 12, color: C.textMute, margin: "0 0 12px", lineHeight: 1.55, maxWidth: 760 }}>
              Both laps' speed on a shared distance axis — the ghost comparison. Divergence at corner entry
              means a different brake point; a gap on exit means one driver got to power sooner.
            </p>
            <svg viewBox={`0 0 ${W} ${SPEED_H}`} width="100%" style={{ display: "block" }} preserveAspectRatio="none">
              <polyline points={speedPath(cmp.speedA)} fill="none" stroke={colA} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
              <polyline points={speedPath(cmp.speedB)} fill="none" stroke={colB} strokeWidth="1.8" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: M }}>{Math.round(minSpeed)} km/h floor</span>
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: M }}>{Math.round(maxSpeed)} km/h top</span>
            </div>
          </div>

          {/* ---- Driving-style metrics ---- */}
          {metricsA && metricsB && (
            <div style={sty.card}>
              <h3 style={{ ...sty.sectionHead, marginBottom: 6 }}>Driving-style fingerprint</h3>
              <p style={{ fontSize: 12, color: C.textMute, margin: "0 0 14px", lineHeight: 1.55, maxWidth: 760 }}>
                How each driver spent the lap. <strong>Coast %</strong> — time with neither throttle nor brake — is the
                coaching metric: it's time bleeding away between braking and getting back to power.
              </p>
              <MetricRow label="Full throttle" a={metricsA.fullThrottlePct} b={metricsB.fullThrottlePct} fmt={v => v.toFixed(1) + "%"} higherBetter colA={colA} colB={colB} />
              <MetricRow label="Coast (lost time)" a={metricsA.coastPct} b={metricsB.coastPct} fmt={v => v.toFixed(1) + "%"} higherBetter={false} colA={colA} colB={colB} />
              <MetricRow label="On the brakes" a={metricsA.brakePct} b={metricsB.brakePct} fmt={v => v.toFixed(1) + "%"} colA={colA} colB={colB} />
              <MetricRow label="Top speed" a={metricsA.topSpeed} b={metricsB.topSpeed} fmt={v => Math.round(v) + " km/h"} higherBetter colA={colA} colB={colB} />
            </div>
          )}

          <p style={{ fontSize: 10.5, color: C.textFaint, lineHeight: 1.55, margin: "2px 4px 0", maxWidth: 760 }}>
            Method: fastest clean lap for each driver. Speed &amp; pedals from OpenF1 car_data (~4 Hz); distance integrated
            from GPS location. The delta trace's <em>shape</em> is reliable; the headline gap uses the true lap-time
            difference, not the integrated endpoint. Coast/throttle/brake are sample-weighted over the lap.
          </p>
        </>
      )}
    </div>
  );
}

/** Symmetric moving average (radius r). Presentation-only smoothing. */
function smooth(arr: number[], r: number): number[] {
  if (r <= 0 || arr.length < 2 * r + 1) return arr;
  const out = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) { sum += arr[j]; n++; }
    out[i] = sum / n;
  }
  return out;
}

function LegendChip({ color, dash, label }: { color: string; dash: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <svg width="22" height="8" style={{ display: "block" }}>
        <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2.4" strokeDasharray={dash ? "5 3" : undefined} />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: F }}>{label}</span>
    </span>
  );
}

function MetricRow({ label, a, b, fmt, higherBetter, colA, colB }: {
  label: string; a: number; b: number; fmt: (v: number) => string;
  higherBetter?: boolean; colA: string; colB: string;
}) {
  const max = Math.max(a, b, 0.0001);
  // Which driver is "better" on this metric (undefined = neutral, no highlight).
  const aBetter = higherBetter === undefined ? null : (higherBetter ? a > b : a < b);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "58px 1fr 58px", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, textAlign: "right", color: aBetter === true ? C.pos : C.text }}>{fmt(a)}</span>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: (a / max) * 100 + "%", height: 12, borderRadius: "3px 0 0 3px", background: colA, opacity: 0.85 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ width: (b / max) * 100 + "%", height: 12, borderRadius: "0 3px 3px 0", background: colB, opacity: 0.85 }} />
          </div>
        </div>
        <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, color: aBetter === false ? C.pos : C.text }}>{fmt(b)}</span>
      </div>
    </div>
  );
}
