import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { podiumColor, rowBg } from "../../lib/format";
import { api } from "../../lib/api";
import { initCanvas, getCtx, drawWatermark } from "../../lib/canvas";
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
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [sampleLaps, setSampleLaps] = useState(DEFAULT_SAMPLE_LAPS);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const olRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chartScalesRef = useRef<{ events: ClipEvent[]; maxDist: number; maxDrop: number; L: number; T: number; pW: number; pH: number } | null>(null);

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
    if (allResults.length) setSelectedDriver(allResults[0].driver.driver_number);
    setLoading(false);
    setProgress("");
  }, [sessionKey, allLaps, drivers, drvMap, threshold, sampleLaps]);

  useEffect(() => { analyze(); }, [sessionKey, sampleLaps, allLaps, drivers]);

  const selectedResult = useMemo(
    () => results.find(r => r.driver.driver_number === selectedDriver),
    [results, selectedDriver],
  );

  // Draw static canvas
  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !selectedResult || !selectedResult.events.length) {
      chartScalesRef.current = null;
      return;
    }

    const { ctx, W, H } = initCanvas(cv, wrap, 300);
    // Size overlay too
    initCanvas(olRef.current!, wrap, 300);

    const L = 56, R = 16, T = 30, B = 38;
    const pW = W - L - R, pH = H - T - B;
    const events = selectedResult.events;
    const maxDist = Math.max(...events.map(e => e.distance)) * 1.1 || 5000;
    const maxDrop = Math.max(...events.map(e => e.speedDrop)) * 1.2 || 10;

    chartScalesRef.current = { events, maxDist, maxDrop, L, T, pW, pH };

    const toX = (d: number) => L + (d / maxDist) * pW;
    const toY = (drop: number) => T + pH - (drop / maxDrop) * pH;

    // Background
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0d1119";
    ctx.fillRect(L, T, pW, pH);

    // Title
    const drv = selectedResult.driver;
    ctx.font = `bold 11px ${F}`;
    ctx.fillStyle = "#" + (drv.team_colour || "666");
    ctx.textAlign = "left";
    ctx.fillText(`${drv.name_acronym} — Lap ${selectedResult.lap.lap_number} — Super Clipping Zones`, L, 18);

    // Grid
    ctx.strokeStyle = "rgba(99,130,191,.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (let i = 1; i < 5; i++) {
      const y = T + (pH * i) / 5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pW, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = "#2a3a5c";
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + pH); ctx.lineTo(L + pW, T + pH); ctx.stroke();

    // Y labels
    ctx.font = `9px ${M}`;
    ctx.fillStyle = "#3d4f6f";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const v = (maxDrop * i) / 5;
      ctx.fillText(v.toFixed(0) + " km/h", L - 5, toY(v) + 3);
    }

    // X labels
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const d = (maxDist * i) / 5;
      ctx.fillText(d >= 1000 ? (d / 1000).toFixed(1) + "km" : d.toFixed(0) + "m", toX(d), T + pH + 16);
    }

    // Axis titles
    ctx.font = `600 10px ${F}`;
    ctx.fillStyle = "#6b7d9e";
    ctx.textAlign = "center";
    ctx.fillText("Track Distance", L + pW / 2, H - 4);
    ctx.save();
    ctx.translate(12, T + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Speed Lost (km/h)", 0, 0);
    ctx.restore();

    // Clipping event bars
    events.forEach(e => {
      const x = toX(e.distance);
      const y = toY(e.speedDrop);
      const barW = Math.max(pW * 0.015, 4);
      ctx.fillStyle = e.speedDrop > 10 ? "rgba(239,68,68,0.6)" : e.speedDrop > 5 ? "rgba(234,179,8,0.5)" : "rgba(59,130,246,0.4)";
      ctx.fillRect(x - barW / 2, y, barW, T + pH - y);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = e.speedDrop > 10 ? "#ef4444" : e.speedDrop > 5 ? "#eab308" : "#3b82f6";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Legend
    ctx.font = `9px ${F}`;
    ctx.textAlign = "left";
    const legendY = T + 8;
    [
      { color: "#ef4444", label: "> 10 km/h (severe)" },
      { color: "#eab308", label: "5–10 km/h (moderate)" },
      { color: "#3b82f6", label: "< 5 km/h (mild)" },
    ].forEach((item, i) => {
      const lx = L + pW - 150;
      ctx.fillStyle = item.color;
      ctx.beginPath(); ctx.arc(lx, legendY + i * 16, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b7d9e";
      ctx.fillText(item.label, lx + 10, legendY + i * 16 + 3);
    });
    drawWatermark(ctx, W, H);
  }, [selectedResult]);

  // Hover handler for canvas tooltip
  useEffect(() => {
    const ol = olRef.current;
    if (!ol) return;

    const onMove = (e: MouseEvent) => {
      const scales = chartScalesRef.current;
      if (!scales) return;
      const { ctx, W, H } = getCtx(ol);
      const { events, maxDist, maxDrop, L, T, pW, pH } = scales;

      const rect = ol.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = ol.width / dpr;
      const mx = (e.clientX - rect.left) * (cssW / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);

      const toX = (d: number) => L + (d / maxDist) * pW;
      const toY = (drop: number) => T + pH - (drop / maxDrop) * pH;

      // Find closest event
      let closest: ClipEvent | null = null;
      let closestDist = 25;
      events.forEach(ev => {
        const ex = toX(ev.distance), ey = toY(ev.speedDrop);
        const d = Math.sqrt((mx - ex) ** 2 + (my - ey) ** 2);
        if (d < closestDist) { closestDist = d; closest = ev; }
      });

      if (!closest) return;

      const cx = toX(closest.distance), cy = toY(closest.speedDrop);

      // Highlight ring
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tooltip box
      const pad = 10;
      const lines = [
        `Distance: ${closest.distance >= 1000 ? (closest.distance / 1000).toFixed(2) + " km" : closest.distance.toFixed(0) + " m"}`,
        `Speed: ${closest.startSpeed.toFixed(0)} → ${closest.endSpeed.toFixed(0)} km/h`,
        `Drop: ${closest.speedDrop.toFixed(1)} km/h`,
        `Duration: ${closest.duration} ms`,
      ];
      ctx.font = `10px ${M}`;
      const boxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2;
      const boxH = pad + lines.length * 16 + pad;
      let bx = cx + 14;
      if (bx + boxW > W - 8) bx = cx - boxW - 14;
      const by = Math.max(cy - boxH / 2, 8);

      ctx.fillStyle = "rgba(10,14,20,0.94)";
      ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 6); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 6); ctx.stroke();
      ctx.fillStyle = "#e10600";
      ctx.beginPath(); ctx.roundRect(bx, by, boxW, 3, [6, 6, 0, 0]); ctx.fill();

      ctx.fillStyle = "#c8d6e5";
      ctx.textAlign = "left";
      lines.forEach((line, i) => {
        ctx.fillText(line, bx + pad, by + pad + 12 + i * 16);
      });
    };

    const onLeave = () => { getCtx(ol); };

    ol.addEventListener("mousemove", onMove);
    ol.addEventListener("mouseleave", onLeave);
    return () => {
      ol.removeEventListener("mousemove", onMove);
      ol.removeEventListener("mouseleave", onLeave);
    };
  }, [selectedResult]);

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
                    style={{
                      ...rowBg(i),
                      cursor: "pointer",
                      outline: selectedDriver === d.driver?.driver_number ? "1px solid rgba(225,6,0,0.3)" : "none",
                    }}
                    onClick={() => d.driver && setSelectedDriver(d.driver.driver_number)}
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

        {/* Clipping zones chart */}
        {selectedResult && (
          <div style={{ ...sty.card, marginTop: 12 }}>
            <div style={sty.sectionHead}>Clipping Zones on Track</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {driverSummary.map(d => (
                <button
                  key={d.driver?.driver_number}
                  onClick={() => d.driver && setSelectedDriver(d.driver.driver_number)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: F,
                    cursor: "pointer", border: "none", letterSpacing: "0.5px",
                    background: selectedDriver === d.driver?.driver_number
                      ? "linear-gradient(135deg, #e10600, #b80500)" : "rgba(255,255,255,0.03)",
                    color: selectedDriver === d.driver?.driver_number ? "#fff" : "#5a5a6e",
                  }}
                >{d.driver?.name_acronym}</button>
              ))}
            </div>
            <div ref={wrapRef} style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
                <ShareButton canvasRef={cvRef} filename="openf1ow-clipping-zones" />
              </div>
              <canvas ref={cvRef} style={{ display: "block", borderRadius: "8px 8px 0 0" }} />
              <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: "8px 8px 0 0" }} />
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
