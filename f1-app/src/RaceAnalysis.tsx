import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AIAnalysis from "./components/AIAnalysis";
import type { Driver, Lap, Stint, Pit, Weather } from "./lib/types";
import { median, linearSlope, computeSlowLapThreshold, isCleanLap, FUEL_TOTAL_KG, FUEL_SEC_PER_KG, DIRTY_AIR_THRESHOLD } from "./lib/raceUtils";
import { F, M, sty } from "./lib/styles";
import { buildFullSummary } from "./lib/buildAnalysisSummary";

const PROXY = "https://corsproxy.io/?";
const API = "https://api.openf1.org/v1";

async function api(path: string) {
  const urls = [API + path, PROXY + encodeURIComponent(API + path)];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) { /* try next */ }
  }
  throw new Error("Failed to fetch: " + path);
}

const TC: Record<string, string> = {
  SOFT: "#FF3333", MEDIUM: "#FFD700", HARD: "#FFFFFF",
  INTERMEDIATE: "#39B54A", WET: "#0072C6",
};

const DRIVER_COLORS = [
  "e10600", "0072C6", "FFD700", "39B54A", "FF6B35",
  "a855f7", "06b6d4", "f43f5e", "84cc16", "f97316",
  "6366f1", "ec4899", "14b8a6", "eab308", "8b5cf6",
  "22c55e", "3b82f6", "ef4444", "64748b", "d946ef",
];

// Shared formatters
function ft3(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(3);
  return m > 0 ? m + ":" + r.padStart(6, "0") : r + "s";
}

function ft1(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return m > 0 ? m + ":" + r.padStart(4, "0") : r + "s";
}

function ftn(s: number | null): string { return s == null ? "—" : ft3(s); }

function podiumColor(rank: number): string {
  if (rank === 0) return "#FFD700";
  if (rank === 1) return "#C0C0C0";
  if (rank === 2) return "#CD7F32";
  return "#e8e8ec";
}

function rowBg(i: number) {
  return { background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" };
}

// Shared tooltip for hover interactions
function useTooltip(externalRef?: React.RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef || internalRef;

  const show = useCallback((e: React.MouseEvent | MouseEvent, content: React.ReactNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top, content });
  }, [containerRef]);
  const hide = useCallback(() => setTip(null), []);

  const el = tip ? (
    <div style={{
      position: "absolute",
      left: tip.x,
      top: tip.y - 8,
      transform: "translate(-50%, -100%)",
      background: "rgba(10,14,20,0.95)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 11,
      fontFamily: M,
      color: "#e8e8ec",
      pointerEvents: "none" as const,
      zIndex: 10,
      whiteSpace: "nowrap" as const,
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    }}>{tip.content}</div>
  ) : null;

  return { containerRef, show, hide, el };
}

// Chart helpers
const LEFT_MARGIN = 56;
const RIGHT_PAD = 16;
const X_AXIS_H = 32;

function initCanvas(cv: HTMLCanvasElement, wrap: HTMLElement, cssH: number) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  cv.width = cssW * dpr;
  cv.height = cssH * dpr;
  cv.style.width = cssW + "px";
  cv.style.height = cssH + "px";
  const ctx = cv.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return { ctx, W: cssW, H: cssH };
}

//LAP TIME EVOLUTION CHART (Canvas)

function LapEvolutionChart({ allLaps, drivers }: {
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const olRef = useRef<HTMLCanvasElement>(null);
  const CSS_H = 380;
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const toggle = (num: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(allDriverData.map(dd => dd.driver.driver_number)));

  const allDriverData = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const byDriver: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!byDriver[l.driver_number]) byDriver[l.driver_number] = [];
      byDriver[l.driver_number].push(l);
    });

    const DASH_PATTERNS: number[][] = [[], [6, 3], [2, 2], [8, 3, 2, 3]];
    const colorCount: Record<string, number> = {};

    return drivers.map((d, i) => {
      const laps = (byDriver[d.driver_number] || [])
        .filter(l => isCleanLap(l, threshold))
        .sort((a, b) => a.lap_number - b.lap_number);
      const color = d.team_colour || DRIVER_COLORS[i % DRIVER_COLORS.length];
      const idx = colorCount[color] || 0;
      colorCount[color] = idx + 1;
      return {
        driver: d,
        laps,
        color,
        dash: DASH_PATTERNS[idx % DASH_PATTERNS.length],
      };
    }).filter(dd => dd.laps.length > 0);
  }, [allLaps, drivers]);

  const visibleData = useMemo(
    () => allDriverData.filter(dd => !hidden.has(dd.driver.driver_number)),
    [allDriverData, hidden]
  );

  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    const { ctx, W, H } = initCanvas(cv, wrap, CSS_H);
    initCanvas(olRef.current!, wrap, CSS_H);

    const L = LEFT_MARGIN;
    const R = RIGHT_PAD;
    const T = 10;
    const plotW = W - L - R;
    const plotH = H - T - X_AXIS_H;

    // Always compute bounds from ALL drivers so axes don't jump when toggling
    let maxLap = 0, minTime = Infinity, maxTime = 0;
    allDriverData.forEach(dd => dd.laps.forEach(l => {
      if (l.lap_number > maxLap) maxLap = l.lap_number;
      if (l.lap_duration! < minTime) minTime = l.lap_duration!;
      if (l.lap_duration! > maxTime) maxTime = l.lap_duration!;
    }));

    if (!maxLap || minTime === Infinity) {
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const med = (() => {
      const all = allDriverData.flatMap(dd => dd.laps.map(l => l.lap_duration!)).sort((a, b) => a - b);
      return all[Math.floor(all.length / 2)] || minTime;
    })();
    const cappedMax = Math.min(maxTime, med * 1.08);
    const timeRange = cappedMax - minTime;
    const padTime = timeRange * 0.05;
    const yMin = minTime - padTime;
    const yMax = cappedMax + padTime;

    const xPos = (lap: number) => L + ((lap - 1) / Math.max(maxLap - 1, 1)) * plotW;
    const yPos = (t: number) => T + plotH - ((t - yMin) / (yMax - yMin)) * plotH;

    // Background
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0d1119";
    ctx.fillRect(L, T, plotW, plotH);

    // Grid
    ctx.strokeStyle = "rgba(99,130,191,.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    const lapStep = Math.max(1, Math.ceil(maxLap / 15));
    for (let lap = 1; lap <= maxLap; lap += lapStep) {
      const x = xPos(lap);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + plotH); ctx.stroke();
    }
    const timeStep = (() => {
      const range = yMax - yMin;
      if (range < 3) return 0.5;
      if (range < 8) return 1;
      return 2;
    })();
    for (let t = Math.ceil(yMin / timeStep) * timeStep; t <= yMax; t += timeStep) {
      const y = yPos(t);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = "#2a3a5c"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + plotH); ctx.lineTo(W - R, T + plotH); ctx.stroke();

    // X labels
    ctx.font = "10px " + M; ctx.fillStyle = "#3d4f6f"; ctx.textAlign = "center";
    for (let lap = 1; lap <= maxLap; lap += lapStep) ctx.fillText("L" + lap, xPos(lap), T + plotH + 18);

    ctx.textAlign = "right";
    for (let t = Math.ceil(yMin / timeStep) * timeStep; t <= yMax; t += timeStep) ctx.fillText(ft1(t), L - 5, yPos(t) + 3);

    // Draw only visible drivers
    visibleData.forEach(dd => {
      const col = "#" + dd.color;
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = dd.dash.length ? 2 : 1.5;
      ctx.globalAlpha = 0.85; ctx.lineJoin = "round"; ctx.setLineDash(dd.dash);
      dd.laps.forEach((l, i) => {
        const x = xPos(l.lap_number);
        const y = yPos(Math.min(l.lap_duration!, cappedMax));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
    });

    // Hover overlay — only visible drivers
    const ol = olRef.current!;
    const onMove = (e: MouseEvent) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = ol.getBoundingClientRect();
      const olCtx = ol.getContext("2d")!;
      olCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      olCtx.clearRect(0, 0, W, H);
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const hoverLap = Math.round(1 + ((mx - L) / plotW) * (maxLap - 1));
      if (hoverLap < 1 || hoverLap > maxLap) return;

      const xLine = xPos(hoverLap);
      olCtx.strokeStyle = "rgba(200,214,229,.2)"; olCtx.lineWidth = 1;
      olCtx.beginPath(); olCtx.moveTo(xLine, T); olCtx.lineTo(xLine, T + plotH); olCtx.stroke();

      const pts: { name: string; color: string; time: number }[] = [];
      visibleData.forEach(dd => {
        const lap = dd.laps.find(l => l.lap_number === hoverLap);
        if (lap?.lap_duration) pts.push({ name: dd.driver.name_acronym, color: dd.color, time: lap.lap_duration });
      });
      pts.sort((a, b) => a.time - b.time);

      pts.forEach(p => {
        const y = yPos(Math.min(p.time, cappedMax));
        olCtx.beginPath(); olCtx.arc(xLine, y, 3, 0, Math.PI * 2);
        olCtx.fillStyle = "#" + p.color; olCtx.fill();
      });

      if (pts.length) {
        const pad = 10, lineH = 16, boxW = 160;
        const boxH = pad + 16 + pts.length * lineH + pad;
        let bx = xLine + 14;
        if (bx + boxW > W - 8) bx = xLine - boxW - 14;
        const by = Math.max(T + 8, T + plotH / 2 - boxH / 2);

        olCtx.shadowColor = "rgba(0,0,0,.5)"; olCtx.shadowBlur = 16;
        olCtx.fillStyle = "rgba(10,14,20,.93)";
        olCtx.beginPath(); olCtx.roundRect(bx, by, boxW, boxH, 6); olCtx.fill();
        olCtx.shadowColor = "transparent"; olCtx.shadowBlur = 0;
        olCtx.strokeStyle = "#1c2333"; olCtx.lineWidth = 1; olCtx.stroke();
        olCtx.fillStyle = "#e63946";
        olCtx.beginPath(); olCtx.roundRect(bx, by, boxW, 3, [6, 6, 0, 0]); olCtx.fill();

        olCtx.font = "600 10px " + F; olCtx.fillStyle = "#6b7d9e"; olCtx.textAlign = "left";
        olCtx.fillText("Lap " + hoverLap, bx + pad, by + pad + 10);

        olCtx.font = "10px " + M;
        pts.slice(0, 15).forEach((p, i) => {
          const ry = by + pad + 16 + i * lineH + 11;
          olCtx.fillStyle = "#" + p.color;
          olCtx.beginPath(); olCtx.arc(bx + pad + 4, ry - 4, 3, 0, Math.PI * 2); olCtx.fill();
          olCtx.fillStyle = "#c8d6e5"; olCtx.fillText(p.name, bx + pad + 14, ry);
          olCtx.fillStyle = "#6b7d9e"; olCtx.textAlign = "right";
          olCtx.fillText(ft1(p.time), bx + boxW - pad, ry); olCtx.textAlign = "left";
        });
      }
    };

    const onLeave = () => {
      const dpr = window.devicePixelRatio || 1;
      const olCtx = ol.getContext("2d")!;
      olCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      olCtx.clearRect(0, 0, W, H);
    };

    ol.addEventListener("mousemove", onMove);
    ol.addEventListener("mouseleave", onLeave);
    return () => { ol.removeEventListener("mousemove", onMove); ol.removeEventListener("mouseleave", onLeave); };
  }, [allDriverData, visibleData]);

  if (!allDriverData.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No lap data available</div>;

  const allVisible = hidden.size === 0;
  const noneVisible = hidden.size === allDriverData.length;

  return (
    <div>
      {/* Legend — clickable toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={allVisible ? hideAll : showAll} style={{
          fontSize: 9, fontWeight: 700, fontFamily: F, color: "#5a5a6e",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6, padding: "3px 8px", cursor: "pointer",
          letterSpacing: "0.5px",
        }}>{allVisible ? "HIDE ALL" : "SHOW ALL"}</button>
        {allDriverData.map(dd => {
          const isHidden = hidden.has(dd.driver.driver_number);
          const dashStr = dd.dash.length ? dd.dash.join(",") : "none";
          return (
            <button key={dd.driver.driver_number} onClick={() => toggle(dd.driver.driver_number)} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 600, fontFamily: F,
              color: isHidden ? "#3a3a4e" : "#b0b0c0",
              background: isHidden ? "rgba(20,20,36,0.3)" : "rgba(20,20,36,0.7)",
              borderRadius: 6, padding: "3px 8px", cursor: "pointer",
              border: "none", borderLeft: "none",
              opacity: isHidden ? 0.4 : 1,
              transition: "all 0.15s ease",
            }}>
              <svg width="16" height="10" style={{ flexShrink: 0 }}>
                <line x1="0" y1="5" x2="16" y2="5"
                  stroke={isHidden ? "#3a3a4e" : "#" + dd.color}
                  strokeWidth={dd.dash.length ? 2.5 : 2}
                  strokeDasharray={dashStr}
                />
              </svg>
              {dd.driver.name_acronym}
            </button>
          );
        })}
      </div>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <canvas ref={cvRef} style={{ display: "block", borderRadius: 8 }} />
        <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: 8 }} />
      </div>
    </div>
  );
}

//STINT DEGRADATION TABLE

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
  );
}

//TEAMMATE PACE DELTA

function TeammateDelta({ allLaps, drivers }: {
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const teamPairs = useMemo(() => {
    // Group drivers by team
    const teams: Record<string, Driver[]> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!teams[t]) teams[t] = [];
      teams[t].push(d);
    });

    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return Object.entries(teams)
      .filter(([_, ds]) => ds.length >= 2)
      .map(([team, ds]) => {
        // Take first two drivers per team
        const [d1, d2] = ds.slice(0, 2);
        const laps1 = (lapMap[d1.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);
        const laps2 = (lapMap[d2.driver_number] || []).filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap && l.lap_number > 1);

        // Find common laps (both drivers have data)
        const l1Map: Record<number, number> = {};
        laps1.forEach(l => { l1Map[l.lap_number] = l.lap_duration!; });
        const commonLaps: { lap: number; t1: number; t2: number }[] = [];
        laps2.forEach(l => {
          if (l1Map[l.lap_number]) {
            commonLaps.push({ lap: l.lap_number, t1: l1Map[l.lap_number], t2: l.lap_duration! });
          }
        });

        if (!commonLaps.length) return null;

        const avg1 = commonLaps.reduce((s, c) => s + c.t1, 0) / commonLaps.length;
        const avg2 = commonLaps.reduce((s, c) => s + c.t2, 0) / commonLaps.length;

        // Determine who is faster by average, then show gap as positive
        const d1Faster = avg1 <= avg2;
        const faster = d1Faster ? d1 : d2;
        const slower = d1Faster ? d2 : d1;
        const fasterAvg = d1Faster ? avg1 : avg2;
        const slowerAvg = d1Faster ? avg2 : avg1;
        const gap = slowerAvg - fasterAvg; // always positive

        return {
          team,
          faster, slower,
          commonLaps: commonLaps.length,
          gap,
          fasterAvg, slowerAvg,
          color: d1.team_colour || "666",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.gap - b!.gap) as NonNullable<typeof teamPairs[number]>[];
  }, [allLaps, drivers]);

  if (!teamPairs.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>Need 2+ drivers per team</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
      {teamPairs.map(tp => (
          <div key={tp.team} style={{
            ...sty.card,
            borderTop: "3px solid #" + tp.color,
            marginBottom: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#" + tp.color, marginBottom: 10, letterSpacing: "0.5px" }}>
              {tp.team}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontFamily: F,
                  color: "#22c55e",
                }}>{tp.faster.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.fasterAvg)}</div>
                <div style={{ fontSize: 9, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>FASTER</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 12px" }}>
                <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 2 }}>GAP</div>
                <div style={{
                  fontSize: 18, fontWeight: 800, fontFamily: M,
                  color: tp.gap < 0.1 ? "#b0b0c0" : "#e10600",
                }}>+{tp.gap.toFixed(3)}s</div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: F }}>{tp.slower.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.slowerAvg)}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", textAlign: "center" }}>
              {tp.commonLaps} comparable laps
            </div>
          </div>
      ))}
    </div>
  );
}

//PIT STOP EFFICIENCY

function PitStopRanking({ pits, drivers }: {
  pits: Pit[];
  drivers: Driver[];
}) {
  const teamPits = useMemo(() => {
    const drvMap: Record<number, Driver> = {};
    drivers.forEach(d => { drvMap[d.driver_number] = d; });

    const byTeam: Record<string, { stops: Pit[]; color: string }> = {};
    pits.forEach(p => {
      const d = drvMap[p.driver_number];
      if (!d) return;
      const team = d.team_name || "Unknown";
      if (!byTeam[team]) byTeam[team] = { stops: [], color: d.team_colour || "666" };
      byTeam[team].stops.push(p);
    });

    return Object.entries(byTeam).map(([team, { stops, color }]) => {
      const durations = stops
        .map(s => s.pit_duration || s.lane_duration || s.stop_duration)
        .filter(Boolean) as number[];
      if (!durations.length) return null;
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      const best = Math.min(...durations);
      const worst = Math.max(...durations);
      return { team, color, count: stops.length, avg, best, worst, stops };
    })
    .filter(Boolean)
    .sort((a, b) => a!.avg - b!.avg) as NonNullable<typeof teamPits[number]>[];
  }, [pits, drivers]);

  if (!teamPits.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No pit stop data</div>;

  const fastest = teamPits[0]?.avg || 0;

  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["#", "Team", "Stops", "Avg", "Best", "Worst", "vs Best"].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: i <= 1 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamPits.map((t, i) => (
            <tr key={t.team} style={rowBg(i)}>
              <td style={{
                ...sty.td, fontWeight: 800, fontSize: 14,
                color: podiumColor(i),
              }}>{i + 1}</td>
              <td style={{
                ...sty.td,
                borderLeft: "3px solid #" + t.color,
                paddingLeft: 12,
                fontWeight: 600,
              }}>{t.team}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{t.count}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{t.avg.toFixed(2)}s</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#22c55e" }}>{t.best.toFixed(2)}s</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#ef4444" }}>{t.worst.toFixed(2)}s</td>
              <td style={{
                ...sty.td, ...sty.mono, textAlign: "right",
                color: i === 0 ? "#22c55e" : "#fbbf24",
                fontWeight: 600,
              }}>
                {i === 0 ? "—" : "+" + (t.avg - fastest).toFixed(2) + "s"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

//RACE PACE RANKING (average pace excluding outliers)

function RacePaceRanking({ allLaps, drivers, viewMode }: {
  allLaps: Lap[];
  drivers: Driver[];
  viewMode: "list" | "graph";
}) {
  const rankings = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return drivers.map(d => {
      const cleanLaps = (lapMap[d.driver_number] || [])
        .filter(l => isCleanLap(l, threshold));
      if (cleanLaps.length < 3) return null;

      const times = cleanLaps.map(l => l.lap_duration!).sort((a, b) => a - b);
      const med = median(times);
      const best = times[0];
      const totalLaps = cleanLaps.length;

      return { driver: d, med, best, totalLaps, color: d.team_colour || "666", times };
    })
    .filter(Boolean)
    .sort((a, b) => a!.med - b!.med) as NonNullable<typeof rankings[number]>[];
  }, [allLaps, drivers]);

  if (!rankings.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No data</div>;

  const fastest = rankings[0]?.med || 0;

  if (viewMode === "graph") {
    return (
      <BoxPlotChart rows={rankings.map(r => ({
        label: r.driver.name_acronym,
        color: r.color,
        times: r.times,
      }))} />
    );
  }

  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["#", "Driver", "Team", "Median Pace", "Best", "Gap", "Laps"].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: i <= 2 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rankings.map((r, i) => (
            <tr key={r.driver.driver_number} style={rowBg(i)}>
              <td style={{
                ...sty.td, fontWeight: 800, fontSize: 14,
                color: podiumColor(i),
              }}>{i + 1}</td>
              <td style={{
                ...sty.td,
                borderLeft: "3px solid #" + r.color,
                paddingLeft: 12,
                fontWeight: 600,
              }}>
                <span style={{ color: "#5a5a6e", marginRight: 6, fontSize: 11 }}>#{r.driver.driver_number}</span>
                {r.driver.full_name}
              </td>
              <td style={{ ...sty.td, color: "#" + r.color, fontSize: 11, fontWeight: 600 }}>{r.driver.team_name}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{ft3(r.med)}</td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#a855f7" }}>{ft3(r.best)}</td>
              <td style={{
                ...sty.td, ...sty.mono, textAlign: "right",
                color: i === 0 ? "#22c55e" : "#ef4444",
                fontWeight: 600,
              }}>
                {i === 0 ? "—" : "+" + (r.med - fastest).toFixed(3) + "s"}
              </td>
              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e" }}>{r.totalLaps}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

//CONSTRUCTOR PACE RANKING (team-level aggregation)

function ConstructorPace({ allLaps, drivers, viewMode }: {
  viewMode: "list" | "graph";
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const teams = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const teamMap: Record<string, { drivers: Driver[]; color: string }> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!teamMap[t]) teamMap[t] = { drivers: [], color: d.team_colour || "666" };
      teamMap[t].drivers.push(d);
    });

    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    return Object.entries(teamMap).map(([team, { drivers: tDrivers, color }]) => {
      // Collect all clean laps for the team
      const allClean: number[] = [];
      const driverStats = tDrivers.map(d => {
        const clean = (lapMap[d.driver_number] || [])
          .filter(l => isCleanLap(l, threshold))
          .map(l => l.lap_duration!);
        allClean.push(...clean);

        if (clean.length < 3) return null;
        const avg = median(clean);
        const best = Math.min(...clean);
        return { driver: d, avg, best, laps: clean.length };
      }).filter(Boolean) as { driver: Driver; avg: number; best: number; laps: number }[];

      if (allClean.length < 5) return null;

      const teamAvg = median(allClean);
      const teamBest = Math.min(...allClean);

      return { team, color, teamAvg, teamBest, driverStats, totalLaps: allClean.length, times: allClean };
    })
    .filter(Boolean)
    .sort((a, b) => a!.teamAvg - b!.teamAvg) as NonNullable<typeof teams[number]>[];
  }, [allLaps, drivers]);

  if (!teams.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No data</div>;

  const fastest = teams[0]?.teamAvg || 0;
  const maxGap = teams.length > 1 ? teams[teams.length - 1].teamAvg - fastest : 1;

  if (viewMode === "graph") {
    return (
      <BoxPlotChart rows={teams.map(t => ({
        label: teamAbbr(t.team),
        color: t.color,
        times: t.times,
      }))} />
    );
  }

  return (
    <div>
      {teams.map((t, i) => (
        <div key={t.team} style={{
          ...sty.card,
          marginBottom: 8,
          borderLeft: "4px solid #" + t.color,
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontWeight: 800, fontSize: 18,
                color: podiumColor(i),
                fontFamily: F, minWidth: 28,
              }}>P{i + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#" + t.color, fontFamily: F }}>{t.team}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M }}>{ft3(t.teamAvg)}</div>
              <div style={{
                fontSize: 11, fontFamily: M, fontWeight: 600,
                color: i === 0 ? "#22c55e" : "#ef4444",
              }}>
                {i === 0 ? "LEADER" : "+" + (t.teamAvg - fastest).toFixed(3) + "s"}
              </div>
            </div>
          </div>
          {/* Gap bar */}
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginBottom: 10 }}>
            <div style={{
              height: 4, borderRadius: 2, background: "#" + t.color, opacity: 0.6,
              width: (i === 0 ? 100 : Math.max(5, 100 - ((t.teamAvg - fastest) / maxGap) * 80)) + "%",
            }} />
          </div>
          {/* Driver breakdown */}
          <div style={{ display: "flex", gap: 16 }}>
            {t.driverStats.map(ds => (
              <div key={ds.driver.driver_number} style={{
                flex: 1,
                background: "rgba(10,14,20,0.5)",
                borderRadius: 8,
                padding: "8px 12px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: F, marginBottom: 4 }}>
                  {ds.driver.name_acronym}
                  <span style={{ color: "#5a5a6e", fontWeight: 400, fontSize: 10, marginLeft: 6 }}>#{ds.driver.driver_number}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#b0b0c0" }}>
                  <span>Med: <span style={{ fontFamily: M, fontWeight: 600 }}>{ft3(ds.avg)}</span></span>
                  <span>Best: <span style={{ fontFamily: M, fontWeight: 600, color: "#a855f7" }}>{ft3(ds.best)}</span></span>
                  <span style={{ color: "#5a5a6e" }}>{ds.laps} laps</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

//WEATHER CORRELATION

function WeatherCorrelation({ allLaps, drivers, weather }: {
  allLaps: Lap[];
  drivers: Driver[];
  weather: Weather[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { show: wxShow, hide: wxHide, el: wxTipEl } = useTooltip(wrapRef);
  const CSS_H = 320;

  // Build lap-by-lap correlation: assign each lap a track temp based on closest weather reading
  const analysis = useMemo(() => {
    if (!weather.length || !allLaps.length) return null;

    const weatherTimes = weather.map(w => ({ t: new Date(w.date).getTime(), ...w }));

    const findWeather = (dateStr: string) => {
      const t = new Date(dateStr).getTime();
      let lo = 0, hi = weatherTimes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (weatherTimes[mid].t < t) lo = mid + 1; else hi = mid;
      }
      if (lo > 0 && Math.abs(weatherTimes[lo - 1].t - t) < Math.abs(weatherTimes[lo].t - t)) lo--;
      return weatherTimes[lo];
    };

    // Group laps into track temp buckets and compute avg pace per bucket
    const threshold = computeSlowLapThreshold(allLaps);
    const buckets: Record<number, number[]> = {};
    const cleanLaps = allLaps.filter(l => isCleanLap(l, threshold) && l.date_start);
    cleanLaps.forEach(l => {
      const w = findWeather(l.date_start);
      const bucket = Math.round(w.track_temperature);
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(l.lap_duration!);
    });

    const tempPace = Object.entries(buckets)
      .map(([temp, times]) => ({
        temp: Number(temp), avg: median(times), count: times.length,
      }))
      .filter(d => d.count >= 5)
      .sort((a, b) => a.temp - b.temp);

    // Per-driver adaptability: variance in pace at different temps
    const driverAdaptability = drivers.map(d => {
      const driverLaps = cleanLaps.filter(l => l.driver_number === d.driver_number);
      if (driverLaps.length < 10) return null;
      const tempGroups: Record<string, number[]> = { low: [], mid: [], high: [] };
      const temps = weatherTimes.map(w => w.track_temperature);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      const range = maxTemp - minTemp;
      if (range < 3) return null;

      driverLaps.forEach(l => {
        const w = findWeather(l.date_start);
        const pct = (w.track_temperature - minTemp) / range;
        if (pct < 0.33) tempGroups.low.push(l.lap_duration!);
        else if (pct < 0.66) tempGroups.mid.push(l.lap_duration!);
        else tempGroups.high.push(l.lap_duration!);
      });

      const avgGroup = (arr: number[]) => arr.length ? median(arr) : null;

      const lowAvg = avgGroup(tempGroups.low);
      const midAvg = avgGroup(tempGroups.mid);
      const highAvg = avgGroup(tempGroups.high);

      return {
        driver: d,
        lowAvg, midAvg, highAvg,
        lowCount: tempGroups.low.length,
        midCount: tempGroups.mid.length,
        highCount: tempGroups.high.length,
        color: d.team_colour || "666",
      };
    }).filter(Boolean) as NonNullable<typeof driverAdaptability[number]>[];

    // Weather summary
    const firstW = weatherTimes[0];
    const lastW = weatherTimes[weatherTimes.length - 1];
    const hadRain = weatherTimes.some(w => w.rainfall);
    const tempDelta = lastW.track_temperature - firstW.track_temperature;

    return { tempPace, driverAdaptability, firstW, lastW, hadRain, tempDelta };
  }, [allLaps, drivers, weather]);

  // Draw temp vs pace chart
  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !analysis || !analysis.tempPace.length) return;

    const { ctx, W, H } = initCanvas(cv, wrap, CSS_H);
    const L = LEFT_MARGIN;
    const R = RIGHT_PAD;
    const T = 10;
    const plotW = W - L - R;
    const plotH = H - T - X_AXIS_H;

    const data = analysis.tempPace;
    const minTemp = data[0].temp;
    const maxTemp = data[data.length - 1].temp;
    const minPace = Math.min(...data.map(d => d.avg));
    const maxPace = Math.max(...data.map(d => d.avg));
    const padPace = (maxPace - minPace) * 0.1 || 1;

    const xPos = (temp: number) => L + ((temp - minTemp) / Math.max(maxTemp - minTemp, 1)) * plotW;
    const yPos = (pace: number) => T + plotH - ((pace - (minPace - padPace)) / ((maxPace + padPace) - (minPace - padPace))) * plotH;

    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0d1119";
    ctx.fillRect(L, T, plotW, plotH);

    // Grid
    ctx.strokeStyle = "rgba(99,130,191,.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (let temp = Math.ceil(minTemp); temp <= maxTemp; temp++) {
      const x = xPos(temp);
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x, T + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = "#2a3a5c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, T);
    ctx.lineTo(L, T + plotH);
    ctx.lineTo(W - R, T + plotH);
    ctx.stroke();

    // X labels
    ctx.font = "10px " + M;
    ctx.fillStyle = "#3d4f6f";
    ctx.textAlign = "center";
    for (let temp = Math.ceil(minTemp); temp <= maxTemp; temp++) {
      ctx.fillText(temp + "\u00B0C", xPos(temp), T + plotH + 18);
    }

    ctx.textAlign = "right";
    const paceStep = (maxPace - minPace) < 3 ? 0.5 : 1;
    for (let p = Math.floor(minPace); p <= maxPace + padPace; p += paceStep) {
      const y = yPos(p);
      if (y > T && y < T + plotH) {
        ctx.fillText(ft1(p), L - 5, y + 3);
      }
    }

    // Line & dots
    ctx.beginPath();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    data.forEach((d, i) => {
      const x = xPos(d.temp);
      const y = yPos(d.avg);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots with size based on sample count
    data.forEach(d => {
      const x = xPos(d.temp);
      const y = yPos(d.avg);
      const r = Math.min(6, Math.max(3, d.count / 10));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
      ctx.strokeStyle = "rgba(249,115,22,.3)";
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Labels
    ctx.font = "600 10px " + F;
    ctx.fillStyle = "#6b7d9e";
    ctx.textAlign = "center";
    ctx.fillText("Track Temperature", L + plotW / 2, T + plotH + 28);
    ctx.save();
    ctx.translate(14, T + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Avg Lap Time", 0, 0);
    ctx.restore();
  }, [analysis]);

  if (!analysis) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No weather data for this session</div>;


  return (
    <div>
      {/* Weather summary cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: "3px solid #f97316",
        }}>
          <div style={{...sty.statLabel}}>Track Temp Range</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M }}>
            {analysis.firstW.track_temperature.toFixed(1)}{"\u00B0"} → {analysis.lastW.track_temperature.toFixed(1)}{"\u00B0"}C
          </div>
          <div style={{
            fontSize: 11, fontFamily: M, marginTop: 2,
            color: analysis.tempDelta > 0 ? "#ef4444" : "#22c55e",
          }}>
            {analysis.tempDelta > 0 ? "+" : ""}{analysis.tempDelta.toFixed(1)}{"\u00B0"}C
          </div>
        </div>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: analysis.hadRain ? "3px solid #3b82f6" : "3px solid #22c55e",
        }}>
          <div style={{...sty.statLabel}}>Conditions</div>
          <div style={{ fontSize: 20 }}>{analysis.hadRain ? "\u2601\uFE0F" : "\u2600\uFE0F"}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: analysis.hadRain ? "#3b82f6" : "#22c55e" }}>
            {analysis.hadRain ? "Rain detected" : "Dry session"}
          </div>
        </div>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: "3px solid #8b5cf6",
        }}>
          <div style={{...sty.statLabel}}>Air Temp</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M }}>
            {analysis.firstW.air_temperature.toFixed(1)}{"\u00B0"} → {analysis.lastW.air_temperature.toFixed(1)}{"\u00B0"}C
          </div>
        </div>
      </div>

      {/* Track temp vs pace chart */}
      {analysis.tempPace.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#f97316", marginBottom: 8 }}>
            Track Temperature vs Average Lap Pace
          </div>
          <div ref={wrapRef} style={{ position: "relative" }}>
            {wxTipEl}
            <canvas ref={cvRef} style={{ display: "block", borderRadius: 8 }}
              onMouseMove={(e) => {
                if (!analysis || !wrapRef.current) return;
                const rect = wrapRef.current.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const W = wrapRef.current.clientWidth;
                const plotW = W - LEFT_MARGIN - RIGHT_PAD;
                const data = analysis.tempPace;
                if (!data.length) return;
                const minT = data[0].temp;
                const maxT = data[data.length - 1].temp;
                const tempRange = Math.max(maxT - minT, 1);
                const hoverTemp = minT + ((mx - LEFT_MARGIN) / plotW) * tempRange;
                // Find closest data point
                let closest = data[0];
                let minDist = Infinity;
                data.forEach(d => {
                  const dist = Math.abs(d.temp - hoverTemp);
                  if (dist < minDist) { minDist = dist; closest = d; }
                });
                if (minDist > tempRange * 0.1) { wxHide(); return; }
                wxShow(e, (
                  <div>
                    <div style={{ fontWeight: 700, color: "#f97316", marginBottom: 4 }}>{closest.temp}{"\u00B0"}C</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
                      <span style={{ color: "#5a5a6e" }}>Avg Pace</span><span>{ft3(closest.avg)}</span>
                      <span style={{ color: "#5a5a6e" }}>Laps</span><span>{closest.count}</span>
                    </div>
                  </div>
                ));
              }}
              onMouseLeave={wxHide} />
          </div>
        </div>
      )}

      {/* Driver adaptability */}
      {analysis.driverAdaptability.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#8b5cf6", marginBottom: 8 }}>
            Driver Pace by Temperature Zone
          </div>
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Driver", "Cool Pace", "(laps)", "Mid Pace", "(laps)", "Hot Pace", "(laps)", "Hot-Cool"].map((h, i) => (
                    <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.driverAdaptability
                  .sort((a, b) => ((a.midAvg || a.lowAvg || a.highAvg) || 0) - ((b.midAvg || b.lowAvg || b.highAvg) || 0))
                  .map((da, i) => {
                    const hotCool = (da.highAvg && da.lowAvg) ? da.highAvg - da.lowAvg : null;
                    return (
                      <tr key={da.driver.driver_number} style={rowBg(i)}>
                        <td style={{
                          ...sty.td,
                          borderLeft: "3px solid #" + da.color,
                          paddingLeft: 12,
                          fontWeight: 600,
                        }}>
                          {da.driver.name_acronym}
                        </td>
                        <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#06b6d4" }}>{ftn(da.lowAvg)}</td>
                        <td style={{ ...sty.td, textAlign: "right", color: "#5a5a6e", fontSize: 10 }}>{da.lowCount}</td>
                        <td style={{ ...sty.td, ...sty.mono, textAlign: "right" }}>{ftn(da.midAvg)}</td>
                        <td style={{ ...sty.td, textAlign: "right", color: "#5a5a6e", fontSize: 10 }}>{da.midCount}</td>
                        <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#f97316" }}>{ftn(da.highAvg)}</td>
                        <td style={{ ...sty.td, textAlign: "right", color: "#5a5a6e", fontSize: 10 }}>{da.highCount}</td>
                        <td style={{
                          ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700,
                          color: hotCool === null ? "#5a5a6e" : hotCool > 0.3 ? "#ef4444" : hotCool < -0.1 ? "#22c55e" : "#b0b0c0",
                        }}>
                          {hotCool !== null ? (hotCool > 0 ? "+" : "") + hotCool.toFixed(3) + "s" : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface DirtyAirLapInfo {
  lapNum: number;
  free: boolean;
  gap: number;
  carAhead: number | null; // driver_number of car ahead
  delta: number; // fuel-corrected delta from stint baseline
}

interface DirtyAirTrainSegment {
  driver: Driver;
  stuckBehind: Driver;
  fromLap: number;
  toLap: number;
  avgTimeLoss: number;
}

interface DirtyAirDriverResult {
  driver: Driver;
  color: string;
  totalLaps: number;
  freeLaps: number;
  dirtyLaps: number;
  freeMedianDelta: number;
  dirtyMedianDelta: number;
  delta: number;
  pctFree: number;
  lapDetails: DirtyAirLapInfo[];
  trains: DirtyAirTrainSegment[];
}

function useDirtyAirData(allLaps: Lap[], drivers: Driver[], stints: Stint[]) {
  return useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
    const fuelCorrPerLap = (FUEL_TOTAL_KG / totalRaceLaps) * FUEL_SEC_PER_KG;

    const lapMap: Record<string, Lap> = {};
    allLaps.forEach(l => { lapMap[l.driver_number + "-" + l.lap_number] = l; });

    const driverMap: Record<number, Driver> = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    const stintMap: Record<number, Stint[]> = {};
    stints.forEach(s => {
      if (!stintMap[s.driver_number]) stintMap[s.driver_number] = [];
      stintMap[s.driver_number].push(s);
    });

    // For each lap number, compute gap to car ahead and who that car is
    const lapGroups: Record<number, { driver_number: number; date: number }[]> = {};
    allLaps.forEach(l => {
      if (!l.date_start) return;
      if (!lapGroups[l.lap_number]) lapGroups[l.lap_number] = [];
      lapGroups[l.lap_number].push({
        driver_number: l.driver_number,
        date: new Date(l.date_start).getTime(),
      });
    });

    const gapMap: Record<string, number> = {};
    const aheadMap: Record<string, number> = {}; // "driver-lap" -> driver_number of car ahead
    Object.entries(lapGroups).forEach(([lapStr, entries]) => {
      const sorted = [...entries].sort((a, b) => a.date - b.date);
      sorted.forEach((entry, idx) => {
        const key = entry.driver_number + "-" + lapStr;
        if (idx === 0) {
          gapMap[key] = 999;
          aheadMap[key] = -1;
        } else {
          gapMap[key] = (entry.date - sorted[idx - 1].date) / 1000;
          aheadMap[key] = sorted[idx - 1].driver_number;
        }
      });
    });

    const results: DirtyAirDriverResult[] = [];

    drivers.forEach(d => {
      const driverStints = stintMap[d.driver_number] || [];
      if (!driverStints.length) return;

      const taggedLaps: DirtyAirLapInfo[] = [];

      driverStints.forEach(st => {
        const stintLaps: { lap: Lap; fuelCorrected: number }[] = [];
        for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
          const lap = lapMap[d.driver_number + "-" + ln];
          if (!lap || !isCleanLap(lap, threshold)) continue;
          const fuelCorrected = lap.lap_duration! + (lap.lap_number - 1) * fuelCorrPerLap;
          stintLaps.push({ lap, fuelCorrected });
        }
        const usable = stintLaps.slice(2);
        if (usable.length < 3) return;

        const baseline = median(usable.map(l => l.fuelCorrected));

        usable.forEach(({ lap, fuelCorrected }) => {
          const key = d.driver_number + "-" + lap.lap_number;
          const gap = gapMap[key];
          if (gap === undefined) return;
          const ahead = aheadMap[key];
          taggedLaps.push({
            lapNum: lap.lap_number,
            free: gap >= DIRTY_AIR_THRESHOLD,
            gap,
            carAhead: ahead > 0 ? ahead : null,
            delta: fuelCorrected - baseline,
          });
        });
      });

      if (taggedLaps.length < 5) return;

      const freeAir = taggedLaps.filter(l => l.free);
      const dirtyAir = taggedLaps.filter(l => !l.free);
      if (freeAir.length < 2 || dirtyAir.length < 2) return;

      const freeMedianDelta = median(freeAir.map(l => l.delta));
      const dirtyMedianDelta = median(dirtyAir.map(l => l.delta));
      const delta = dirtyMedianDelta - freeMedianDelta;
      const pctFree = (freeAir.length / taggedLaps.length) * 100;

      // Detect "stuck behind" train segments: consecutive dirty laps behind the same car
      const trains: DirtyAirTrainSegment[] = [];
      let trainStart = -1;
      let trainBehind = -1;
      const trainDeltas: number[] = [];

      const sorted = [...taggedLaps].sort((a, b) => a.lapNum - b.lapNum);
      sorted.forEach((lap, idx) => {
        const isContinuation = !lap.free && lap.carAhead != null && lap.carAhead === trainBehind;
        if (isContinuation) {
          trainDeltas.push(lap.delta);
        } else {
          // Flush previous train if it was 3+ laps
          if (trainStart >= 0 && trainDeltas.length >= 3 && driverMap[trainBehind]) {
            trains.push({
              driver: d,
              stuckBehind: driverMap[trainBehind],
              fromLap: trainStart,
              toLap: sorted[idx - 1].lapNum,
              avgTimeLoss: trainDeltas.reduce((s, v) => s + v, 0) / trainDeltas.length,
            });
          }
          // Start new potential train
          if (!lap.free && lap.carAhead != null) {
            trainStart = lap.lapNum;
            trainBehind = lap.carAhead;
            trainDeltas.length = 0;
            trainDeltas.push(lap.delta);
          } else {
            trainStart = -1;
            trainBehind = -1;
            trainDeltas.length = 0;
          }
        }
      });
      // Flush last train
      if (trainStart >= 0 && trainDeltas.length >= 3 && driverMap[trainBehind]) {
        trains.push({
          driver: d,
          stuckBehind: driverMap[trainBehind],
          fromLap: trainStart,
          toLap: sorted[sorted.length - 1].lapNum,
          avgTimeLoss: trainDeltas.reduce((s, v) => s + v, 0) / trainDeltas.length,
        });
      }

      results.push({
        driver: d,
        color: d.team_colour || "666",
        totalLaps: taggedLaps.length,
        freeLaps: freeAir.length,
        dirtyLaps: dirtyAir.length,
        freeMedianDelta,
        dirtyMedianDelta,
        delta,
        pctFree,
        lapDetails: sorted,
        trains: trains.sort((a, b) => (b.toLap - b.fromLap) - (a.toLap - a.fromLap)),
      });
    });

    return results.sort((a, b) => a.delta - b.delta);
  }, [allLaps, drivers, stints]);
}

// Timeline chart: each driver row shows green/red blocks per lap
function DirtyAirTimeline({ data, totalLaps, drivers }: { data: DirtyAirDriverResult[]; totalLaps: number; drivers: Driver[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { show: tipShow, hide: tipHide, el: tipEl } = useTooltip(wrapRef);
  const ROW_H = 28;
  const TOP_PAD = 24;
  const BOT_PAD = 32;
  const cssH = TOP_PAD + data.length * ROW_H + BOT_PAD;

  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !data.length) return;
    const { ctx, W, H } = initCanvas(cv, wrap, cssH);

    ctx.fillStyle = "rgba(12,12,22,0.8)";
    ctx.fillRect(0, 0, W, H);

    const labelW = 52;
    const chartL = labelW + 4;
    const chartR = W - RIGHT_PAD;
    const chartW = chartR - chartL;

    // X-axis: lap numbers
    const lapW = chartW / totalLaps;

    // Draw lap number markers along top
    ctx.font = `9px ${M}`;
    ctx.fillStyle = "#5a5a6e";
    ctx.textAlign = "center";
    const step = totalLaps <= 30 ? 5 : totalLaps <= 50 ? 5 : 10;
    for (let ln = step; ln <= totalLaps; ln += step) {
      const x = chartL + (ln - 0.5) * lapW;
      ctx.fillText("L" + ln, x, TOP_PAD - 8);
    }

    // Draw each driver row
    data.forEach((d, rowIdx) => {
      const y = TOP_PAD + rowIdx * ROW_H;

      // Subtle row separator
      if (rowIdx > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.beginPath();
        ctx.moveTo(chartL, y);
        ctx.lineTo(chartR, y);
        ctx.stroke();
      }

      // Driver label
      ctx.font = `bold 10px ${F}`;
      ctx.fillStyle = "#" + d.color;
      ctx.textAlign = "right";
      ctx.fillText(d.driver.name_acronym, labelW, y + ROW_H / 2 + 3.5);

      // Build a full-race array: for each lap, check if we have data
      const lapLookup: Record<number, DirtyAirLapInfo> = {};
      d.lapDetails.forEach(l => { lapLookup[l.lapNum] = l; });

      for (let ln = 1; ln <= totalLaps; ln++) {
        const x = chartL + (ln - 1) * lapW;
        const info = lapLookup[ln];
        const bH = ROW_H - 8;
        const bY = y + 4;

        if (!info) {
          // No data (pit lap, slow lap, etc)
          ctx.fillStyle = "rgba(255,255,255,0.02)";
          ctx.fillRect(x + 0.5, bY, Math.max(lapW - 1, 1), bH);
        } else if (info.free) {
          ctx.fillStyle = "rgba(34,197,94,0.5)";
          ctx.fillRect(x + 0.5, bY, Math.max(lapW - 1, 1), bH);
        } else {
          // Dirty air: intensity based on gap (closer = more red)
          const intensity = Math.min(1, (DIRTY_AIR_THRESHOLD - info.gap) / DIRTY_AIR_THRESHOLD + 0.4);
          ctx.fillStyle = `rgba(239,68,68,${intensity * 0.7})`;
          ctx.fillRect(x + 0.5, bY, Math.max(lapW - 1, 1), bH);
        }
      }
    });

    // Legend at bottom
    const legendY = H - BOT_PAD + 14;
    ctx.font = `9px ${F}`;
    ctx.textAlign = "left";

    const items: [string, string][] = [
      ["rgba(34,197,94,0.5)", "Clean air (>" + DIRTY_AIR_THRESHOLD + "s gap)"],
      ["rgba(239,68,68,0.7)", "Dirty air (<" + DIRTY_AIR_THRESHOLD + "s gap)"],
      ["rgba(255,255,255,0.04)", "No data (pit/slow lap)"],
    ];
    let lx = chartL;
    items.forEach(([color, label]) => {
      ctx.fillStyle = color;
      ctx.fillRect(lx, legendY - 6, 12, 8);
      ctx.fillStyle = "#5a5a6e";
      ctx.fillText(label, lx + 16, legendY);
      lx += ctx.measureText(label).width + 30;
    });
  }, [data, totalLaps, cssH]);

  const drvMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  const onHover = useCallback((e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cssW = wrap.clientWidth;
    const labelW = 52;
    const chartL = labelW + 4;
    const chartR = cssW - RIGHT_PAD;
    const chartW = chartR - chartL;
    const lapW = chartW / totalLaps;

    const rowIdx = Math.floor((my - TOP_PAD) / ROW_H);
    const lapIdx = Math.floor((mx - chartL) / lapW);
    if (rowIdx < 0 || rowIdx >= data.length || lapIdx < 0 || lapIdx >= totalLaps) { tipHide(); return; }

    const d = data[rowIdx];
    const lapNum = lapIdx + 1;
    const info = d.lapDetails.find(l => l.lapNum === lapNum);

    const aheadName = info?.carAhead ? (drvMap[info.carAhead]?.name_acronym || "#" + info.carAhead) : "";
    tipShow(e, (
      <div>
        <div style={{ fontWeight: 700, color: "#" + d.color, marginBottom: 4, fontFamily: F }}>{d.driver.name_acronym} — Lap {lapNum}</div>
        {!info ? <div style={{ color: "#5a5a6e" }}>No data (pit/slow lap)</div> : info.free ? (
          <div style={{ color: "#22c55e" }}>Clean air — gap {info.gap.toFixed(1)}s</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
            <span style={{ color: "#ef4444" }}>Dirty air</span><span>gap {info.gap.toFixed(1)}s</span>
            {aheadName && <><span style={{ color: "#5a5a6e" }}>Behind</span><span>{aheadName}</span></>}
            <span style={{ color: "#5a5a6e" }}>Delta</span><span style={{ color: info.delta > 0 ? "#ef4444" : "#22c55e" }}>{info.delta > 0 ? "+" : ""}{info.delta.toFixed(3)}s</span>
          </div>
        )}
      </div>
    ));
  }, [data, totalLaps, drvMap, tipShow, tipHide]);

  return (
    <div ref={wrapRef} style={{ marginBottom: 14, position: "relative" }}>
      {tipEl}
      <canvas ref={cvRef} style={{ display: "block", borderRadius: 8 }}
        onMouseMove={onHover} onMouseLeave={tipHide} />
    </div>
  );
}

function DirtyAirAnalysis({ allLaps, drivers, stints }: {
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
}) {
  const analysis = useDirtyAirData(allLaps, drivers, stints);
  const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);

  // Collect all notable train segments across all drivers
  const allTrains = useMemo(() => {
    return analysis
      .flatMap(a => a.trains)
      .sort((a, b) => (b.toLap - b.fromLap) - (a.toLap - a.fromLap))
      .slice(0, 8);
  }, [analysis]);

  if (!analysis.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>Not enough data</div>;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: "3px solid #22c55e",
        }}>
          <div style={sty.statLabel}>Least Affected</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F, color: "#22c55e" }}>
            {analysis[0].driver.name_acronym}
          </div>
          <div style={{ fontSize: 11, fontFamily: M, color: "#b0b0c0" }}>
            +{analysis[0].delta.toFixed(3)}s/lap
          </div>
        </div>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: "3px solid #ef4444",
        }}>
          <div style={sty.statLabel}>Most Affected</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F, color: "#ef4444" }}>
            {analysis[analysis.length - 1].driver.name_acronym}
          </div>
          <div style={{ fontSize: 11, fontFamily: M, color: "#b0b0c0" }}>
            +{analysis[analysis.length - 1].delta.toFixed(3)}s/lap
          </div>
        </div>
        <div style={{
          ...sty.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: "center",
          borderTop: "3px solid #3b82f6",
        }}>
          <div style={sty.statLabel}>Dirty Air Zone</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M, color: "#3b82f6" }}>
            &lt;{DIRTY_AIR_THRESHOLD}s
          </div>
          <div style={{ fontSize: 11, color: "#5a5a6e" }}>
            following within this gap
          </div>
        </div>
      </div>

      {/* Lap-by-lap timeline */}
      <div style={{ ...sty.sectionHead, marginBottom: 8, marginTop: 8, fontSize: 10 }}>Race Timeline</div>
      <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 8, lineHeight: 1.4 }}>
        Each row is a driver. Green = clean air, red = stuck behind another car. Darker red = closer gap.
      </p>
      <DirtyAirTimeline data={analysis} totalLaps={totalRaceLaps} drivers={drivers} />

      {/* Traffic incidents: who got stuck behind whom */}
      {allTrains.length > 0 && (
        <>
          <div style={{ ...sty.sectionHead, marginBottom: 8, marginTop: 4, fontSize: 10 }}>Longest Traffic Queues</div>
          <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 8, lineHeight: 1.4 }}>
            Consecutive laps a driver spent stuck behind the same car (3+ laps shown).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {allTrains.map((t, i) => {
              const nLaps = t.toLap - t.fromLap + 1;
              return (
                <div key={i} style={{
                  ...sty.card, marginBottom: 0, padding: "10px 14px",
                  borderLeft: "3px solid #" + (t.driver.team_colour || "666"),
                  flex: "1 1 220px", maxWidth: 320,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#" + (t.driver.team_colour || "e8e8ec"), fontFamily: F }}>
                      {t.driver.name_acronym}
                    </span>
                    <span style={{ fontSize: 10, color: "#5a5a6e" }}>stuck behind</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#" + (t.stuckBehind.team_colour || "e8e8ec"), fontFamily: F }}>
                      {t.stuckBehind.name_acronym}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
                    <span style={{ fontFamily: M, color: "#b0b0c0" }}>
                      Laps {t.fromLap}–{t.toLap}
                    </span>
                    <span style={{ fontFamily: M, color: "#ef4444", fontWeight: 600 }}>
                      {nLaps} laps
                    </span>
                    <span style={{ fontFamily: M, color: t.avgTimeLoss > 0.3 ? "#ef4444" : "#fbbf24", fontSize: 10 }}>
                      {t.avgTimeLoss > 0 ? "+" : ""}{t.avgTimeLoss.toFixed(3)}s/lap avg
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Driver breakdown table */}
      <div style={{ ...sty.sectionHead, marginBottom: 8, marginTop: 4, fontSize: 10 }}>Per-Driver Breakdown</div>
      <div style={{ overflow: "auto", maxHeight: 600 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Driver", "Clean Laps", "Dirty Laps", "Clean vs Dirty", "Time Loss / Lap"].map((h, i) => (
                <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.map((a, i) => (
              <tr key={a.driver.driver_number} style={rowBg(i)}>
                <td style={{
                  ...sty.td,
                  borderLeft: "3px solid #" + a.color,
                  paddingLeft: 12,
                  fontWeight: 600,
                }}>
                  <span style={{ color: "#" + a.color, marginRight: 6, fontSize: 11 }}>
                    {a.driver.name_acronym}
                  </span>
                </td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#22c55e" }}>
                  {a.freeLaps}
                </td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#ef4444" }}>
                  {a.dirtyLaps}
                </td>
                <td style={{ ...sty.td, textAlign: "right" }}>
                  {/* Stacked bar: green portion = clean, red = dirty */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <div style={{
                      width: 80, height: 8, borderRadius: 4,
                      background: "rgba(239,68,68,0.3)",
                      overflow: "hidden", display: "flex",
                    }}>
                      <div style={{
                        width: a.pctFree + "%", height: 8,
                        background: "rgba(34,197,94,0.6)", borderRadius: 4,
                      }} />
                    </div>
                    <span style={{ ...sty.mono, fontSize: 10, color: "#b0b0c0", minWidth: 30, textAlign: "right" }}>
                      {a.pctFree.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={{
                  ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700,
                  color: a.delta > 0.5 ? "#ef4444" : a.delta > 0.2 ? "#fbbf24" : "#22c55e",
                }}>
                  +{a.delta.toFixed(3)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

//SUB-TAB COMPONENT

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 14px",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 600,
        fontFamily: F,
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        borderRadius: 16,
        background: active ? "#e10600" : hovered ? "rgba(225,6,0,0.1)" : "transparent",
        color: active ? "#fff" : hovered ? "#e8e8ec" : "#6a6a7e",
        transition: "all 0.2s ease",
        outline: "none",
        boxShadow: active ? "0 0 10px rgba(225,6,0,0.25)" : "none",
      }}>{children}</button>
  );
}

const TEAM_ABBR: Record<string, string> = {
  "Mercedes": "MER", "McLaren": "MCL", "Ferrari": "FER",
  "Red Bull Racing": "RBR", "Alpine": "ALP", "Audi": "AUD",
  "Racing Bulls": "RCB", "Haas F1 Team": "HAS", "Williams": "WIL",
  "Cadillac": "CAD", "Aston Martin": "AMR", "Kick Sauber": "SAU",
  "BWT Alpine F1 Team": "ALP", "Scuderia Ferrari": "FER",
  "Oracle Red Bull Racing": "RBR", "MoneyGram Haas F1 Team": "HAS",
};

function teamAbbr(name: string): string {
  if (TEAM_ABBR[name]) return TEAM_ABBR[name];
  return name.slice(0, 3).toUpperCase();
}

// List/Graph toggle
function ViewToggle({ mode, onChange }: { mode: "list" | "graph"; onChange: (m: "list" | "graph") => void }) {
  const btn = (m: "list" | "graph", label: string) => (
    <button onClick={() => onChange(m)} style={{
      padding: "4px 12px", border: "none", cursor: "pointer",
      fontSize: 10, fontWeight: 700, fontFamily: F,
      letterSpacing: "0.5px",
      borderRadius: m === "list" ? "6px 0 0 6px" : "0 6px 6px 0",
      background: mode === m ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
      color: mode === m ? "#e8e8ec" : "#5a5a6e",
      transition: "all 0.15s ease",
    }}>{label}</button>
  );
  return <div style={{ display: "inline-flex" }}>{btn("list", "LIST")}{btn("graph", "GRAPH")}</div>;
}

// Horizontal bar chart for rankings
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function BoxPlotChart({ rows }: {
  rows: { label: string; color: string; times: number[] }[];
}) {
  const { containerRef, show, hide, el } = useTooltip();

  if (!rows.length) return null;

  const stats = rows.map(r => {
    const s = [...r.times].sort((a, b) => a - b);
    return {
      ...r,
      p10: percentile(s, 10),
      p25: percentile(s, 25),
      median: percentile(s, 50),
      p75: percentile(s, 75),
      p90: percentile(s, 90),
      count: s.length,
    };
  });

  const globalMin = Math.min(...stats.map(s => s.p10));
  const globalMax = Math.max(...stats.map(s => s.p90));
  const pad = (globalMax - globalMin) * 0.08 || 0.5;
  const xMin = globalMin - pad;
  const xMax = globalMax + pad;
  const xRange = xMax - xMin;

  const toX = (v: number) => ((v - xMin) / xRange) * 100;
  const ROW_H = 28;
  const fastestMedian = stats[0]?.median || 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {el}
      {/* X-axis labels */}
      <div style={{ position: "relative", height: 18, marginLeft: 72, marginBottom: 4 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const v = xMin + (xRange * (i + 0.5)) / 5;
          return (
            <span key={i} style={{
              position: "absolute",
              left: toX(v) + "%",
              transform: "translateX(-50%)",
              fontSize: 9, fontFamily: M, color: "#3d4f6f",
            }}>{ft1(v)}</span>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "2px 0" }}>
        {stats.map((s, i) => {
          const gap = s.median - fastestMedian;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "default" }}
              onMouseMove={e => show(e, (
                <div>
                  <div style={{ fontWeight: 700, color: "#" + s.color, marginBottom: 4, fontFamily: F }}>{s.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
                    <span style={{ color: "#5a5a6e" }}>P10</span><span>{ft3(s.p10)}</span>
                    <span style={{ color: "#5a5a6e" }}>P25</span><span>{ft3(s.p25)}</span>
                    <span style={{ color: "#5a5a6e" }}>Median</span><span style={{ fontWeight: 700 }}>{ft3(s.median)}</span>
                    <span style={{ color: "#5a5a6e" }}>P75</span><span>{ft3(s.p75)}</span>
                    <span style={{ color: "#5a5a6e" }}>P90</span><span>{ft3(s.p90)}</span>
                    <span style={{ color: "#5a5a6e" }}>Laps</span><span>{s.count}</span>
                  </div>
                </div>
              ))}
              onMouseLeave={hide}>
              <span style={{
                fontWeight: 800, fontSize: 11, color: podiumColor(i),
                fontFamily: F, minWidth: 18, textAlign: "right",
              }}>{i + 1}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: F,
                color: "#" + s.color, minWidth: 40,
              }}>{s.label}</span>
              {/* Box plot area */}
              <div style={{ flex: 1, position: "relative", height: ROW_H }}>
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: ROW_H, borderRadius: 3,
                  background: "rgba(255,255,255,0.02)",
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 1,
                  left: toX(s.p10) + "%",
                  width: (toX(s.p90) - toX(s.p10)) + "%",
                  height: 2,
                  background: "#" + s.color,
                  opacity: 0.3,
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 5,
                  left: toX(s.p10) + "%",
                  width: 1, height: 10,
                  background: "#" + s.color,
                  opacity: 0.4,
                }} />
                <div style={{
                  position: "absolute",
                  top: ROW_H / 2 - 5,
                  left: toX(s.p90) + "%",
                  width: 1, height: 10,
                  background: "#" + s.color,
                  opacity: 0.4,
                }} />
                <div style={{
                  position: "absolute",
                  top: 4,
                  left: toX(s.p25) + "%",
                  width: Math.max(2, toX(s.p75) - toX(s.p25)) + "%",
                  height: ROW_H - 8,
                  borderRadius: 3,
                  background: "#" + s.color,
                  opacity: 0.3,
                  border: "1px solid #" + s.color,
                }} />
                <div style={{
                  position: "absolute",
                  top: 2,
                  left: toX(s.median) + "%",
                  width: 2, height: ROW_H - 4,
                  borderRadius: 1,
                  background: "#" + s.color,
                }} />
              </div>
              <div style={{ minWidth: 80, textAlign: "right" }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: "#e8e8ec" }}>
                  {ft3(s.median)}
                </span>
                {i > 0 && (
                  <span style={{ fontSize: 9, fontFamily: M, color: "#ef4444", marginLeft: 6 }}>
                    +{gap.toFixed(3)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", gap: 16, marginTop: 10, paddingLeft: 72,
        fontSize: 9, color: "#5a5a6e", fontFamily: F,
      }}>
        <span>Whiskers: P10–P90</span>
        <span>Box: P25–P75</span>
        <span>Line: Median</span>
      </div>
    </div>
  );
}

// SECTOR ANALYSIS

function SectorAnalysis({ allLaps, drivers }: { allLaps: Lap[]; drivers: Driver[] }) {
  const { containerRef: secTipRef, show: secShow, hide: secHide, el: secTipEl } = useTooltip();

  const data = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    const results = drivers.map(d => {
      const clean = (lapMap[d.driver_number] || []).filter(l =>
        isCleanLap(l, threshold) &&
        l.duration_sector_1 != null && l.duration_sector_2 != null && l.duration_sector_3 != null
      );
      if (clean.length < 3) return null;

      const s1 = clean.map(l => l.duration_sector_1!);
      const s2 = clean.map(l => l.duration_sector_2!);
      const s3 = clean.map(l => l.duration_sector_3!);

      return {
        driver: d,
        color: d.team_colour || "666",
        bestS1: Math.min(...s1), bestS2: Math.min(...s2), bestS3: Math.min(...s3),
        medS1: median(s1), medS2: median(s2), medS3: median(s3),
        theoretical: Math.min(...s1) + Math.min(...s2) + Math.min(...s3),
        actualBest: Math.min(...clean.map(l => l.lap_duration!)),
        laps: clean.length,
      };
    }).filter(Boolean) as NonNullable<typeof results[number]>[];

    // Session-wide best median per sector (for delta calculations)
    const bestMedS1 = results.length ? Math.min(...results.map(r => r.medS1)) : 0;
    const bestMedS2 = results.length ? Math.min(...results.map(r => r.medS2)) : 0;
    const bestMedS3 = results.length ? Math.min(...results.map(r => r.medS3)) : 0;
    const bestBestS1 = results.length ? Math.min(...results.map(r => r.bestS1)) : 0;
    const bestBestS2 = results.length ? Math.min(...results.map(r => r.bestS2)) : 0;
    const bestBestS3 = results.length ? Math.min(...results.map(r => r.bestS3)) : 0;

    // Per-driver: where they gain/lose relative to best median
    const enriched = results.map(r => ({
      ...r,
      deltaS1: r.medS1 - bestMedS1,
      deltaS2: r.medS2 - bestMedS2,
      deltaS3: r.medS3 - bestMedS3,
      totalDelta: (r.medS1 - bestMedS1) + (r.medS2 - bestMedS2) + (r.medS3 - bestMedS3),
      // Which sector is their weakest (largest gap to best)?
      weakest: [r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3].indexOf(
        Math.max(r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3)
      ),
      // Which is their strongest?
      strongest: [r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3].indexOf(
        Math.min(r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3)
      ),
    }));
    enriched.sort((a, b) => a.totalDelta - b.totalDelta);

    // Sector kings: who has best median in each sector
    const s1King = enriched.reduce((best, r) => r.medS1 < best.medS1 ? r : best, enriched[0]);
    const s2King = enriched.reduce((best, r) => r.medS2 < best.medS2 ? r : best, enriched[0]);
    const s3King = enriched.reduce((best, r) => r.medS3 < best.medS3 ? r : best, enriched[0]);

    return { results: enriched, bestMedS1, bestMedS2, bestMedS3, bestBestS1, bestBestS2, bestBestS3, s1King, s2King, s3King };
  }, [allLaps, drivers]);

  if (!data.results.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No sector data</div>;

  const S_COLORS = ["#e10600", "#fbbf24", "#a855f7"];
  const S_NAMES = ["S1", "S2", "S3"];
  const kings = [data.s1King, data.s2King, data.s3King];
  const maxDelta = Math.max(...data.results.map(r => Math.max(r.deltaS1, r.deltaS2, r.deltaS3)), 0.001);

  return (
    <div ref={secTipRef} style={{ position: "relative" }}>
      {secTipEl}

      {/* Sector Kings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {kings.map((k, i) => (
          <div key={i} style={{
            ...sty.card, marginBottom: 0, textAlign: "center",
            borderTop: "3px solid " + S_COLORS[i],
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: S_COLORS[i], letterSpacing: "0.5px", textTransform: "uppercase" as const }}>
              Fastest {S_NAMES[i]}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#" + k.color, fontFamily: F, margin: "4px 0" }}>
              {k.driver.name_acronym}
            </div>
            <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0" }}>
              {[k.medS1, k.medS2, k.medS3][i].toFixed(3)}s
            </div>
            <div style={{ fontSize: 10, fontFamily: F, color: "#5a5a6e", marginTop: 2 }}>
              {k.driver.team_name}
            </div>
          </div>
        ))}
      </div>

      {/* Theoretical Best Lap */}
      {(() => {
        const theoKing = data.results.reduce((best, r) => r.theoretical < best.theoretical ? r : best, data.results[0]);
        return (
          <div style={{ ...sty.card, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px" }}>
            <div>
              <div style={sty.statLabel}>Theoretical Best Lap</div>
              <div style={{ fontSize: 10, color: "#5a5a6e" }}>Sum of best S1 + S2 + S3 across all drivers</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: M, color: "#22c55e" }}>{ft3(data.bestBestS1 + data.bestBestS2 + data.bestBestS3)}</div>
              <div style={{ fontSize: 10, color: "#5a5a6e" }}>
                {data.bestBestS1.toFixed(3)} + {data.bestBestS2.toFixed(3)} + {data.bestBestS3.toFixed(3)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Where Each Driver Gains/Loses — the main insight */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
        Sector Delta to Best (Median Pace)
      </div>
      <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
        How much time each driver loses per sector vs. the session-best median. Green = competitive, red = losing time. The bar shows where to find lap time.
      </div>

      {data.results.map((r, i) => {
        const deltas = [r.deltaS1, r.deltaS2, r.deltaS3];
        return (
          <div key={r.driver.driver_number} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "4px 0", cursor: "default",
          }}
            onMouseMove={e => secShow(e, (
              <div>
                <div style={{ fontWeight: 700, color: "#" + r.color, marginBottom: 4, fontFamily: F }}>{r.driver.full_name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "3px 10px", fontSize: 10 }}>
                  <span></span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Median</span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Best</span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Delta</span>
                  <span style={{ color: S_COLORS[0] }}>S1</span><span>{r.medS1.toFixed(3)}</span><span>{r.bestS1.toFixed(3)}</span><span style={{ color: r.deltaS1 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS1.toFixed(3)}</span>
                  <span style={{ color: S_COLORS[1] }}>S2</span><span>{r.medS2.toFixed(3)}</span><span>{r.bestS2.toFixed(3)}</span><span style={{ color: r.deltaS2 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS2.toFixed(3)}</span>
                  <span style={{ color: S_COLORS[2] }}>S3</span><span>{r.medS3.toFixed(3)}</span><span>{r.bestS3.toFixed(3)}</span><span style={{ color: r.deltaS3 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS3.toFixed(3)}</span>
                  <span style={{ color: "#5a5a6e" }}>Total</span><span style={{ fontWeight: 700 }}>{ft3(r.medS1 + r.medS2 + r.medS3)}</span><span>{ft3(r.theoretical)}</span><span style={{ fontWeight: 700, color: "#ef4444" }}>+{r.totalDelta.toFixed(3)}</span>
                </div>
              </div>
            ))}
            onMouseLeave={secHide}>
            <div style={{
              width: 22, textAlign: "right", fontWeight: 800, fontSize: 12,
              color: podiumColor(i), fontFamily: F, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{
              width: 44, fontWeight: 700, fontSize: 11, fontFamily: F,
              color: "#" + r.color, flexShrink: 0,
            }}>{r.driver.name_acronym}</div>
            {/* Three delta bars side by side */}
            <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
              {deltas.map((d, si) => {
                const pct = maxDelta > 0 ? (d / maxDelta) * 100 : 0;
                const isStrong = si === r.strongest;
                return (
                  <div key={si} style={{ flex: 1, position: "relative", height: 18 }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: "100%", height: 18, borderRadius: 3,
                      background: "rgba(255,255,255,0.02)",
                    }} />
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: Math.max(2, Math.min(100, pct)) + "%",
                      height: 18, borderRadius: 3,
                      background: d < 0.05 ? "rgba(34,197,94,0.4)" : d < 0.15 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)",
                      transition: "width 0.3s",
                    }} />
                    <div style={{
                      position: "absolute", top: 1, left: 4,
                      fontSize: 8, fontWeight: 600, color: S_COLORS[si], opacity: 0.6,
                    }}>{S_NAMES[si]}</div>
                    <div style={{
                      position: "absolute", top: 2, right: 4,
                      fontSize: 9, fontWeight: isStrong ? 700 : 500, fontFamily: M,
                      color: d < 0.05 ? "#22c55e" : d < 0.15 ? "#fbbf24" : "#ef4444",
                    }}>+{d.toFixed(3)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{
              fontFamily: M, fontSize: 10, fontWeight: 600, flexShrink: 0, width: 56, textAlign: "right",
              color: i === 0 ? "#22c55e" : "#ef4444",
            }}>
              {i === 0 ? "leader" : "+" + r.totalDelta.toFixed(3)}
            </div>
          </div>
        );
      })}
      {/* Speed Trap Analysis */}
      {(() => {
        const threshold = computeSlowLapThreshold(allLaps);
        const lapMap: Record<number, Lap[]> = {};
        allLaps.forEach(l => {
          if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
          lapMap[l.driver_number].push(l);
        });
        const speedData = drivers.map(d => {
          const clean = (lapMap[d.driver_number] || []).filter(l => isCleanLap(l, threshold));
          const speeds = { st: [] as number[], i1: [] as number[], i2: [] as number[] };
          clean.forEach(l => {
            if (l.st_speed != null) speeds.st.push(l.st_speed);
            if (l.i1_speed != null) speeds.i1.push(l.i1_speed);
            if (l.i2_speed != null) speeds.i2.push(l.i2_speed);
          });
          if (speeds.st.length < 3 && speeds.i1.length < 3 && speeds.i2.length < 3) return null;
          return {
            driver: d, color: d.team_colour || "666",
            maxST: speeds.st.length ? Math.max(...speeds.st) : null,
            medST: speeds.st.length ? median(speeds.st) : null,
            maxI1: speeds.i1.length ? Math.max(...speeds.i1) : null,
            medI1: speeds.i1.length ? median(speeds.i1) : null,
            maxI2: speeds.i2.length ? Math.max(...speeds.i2) : null,
            medI2: speeds.i2.length ? median(speeds.i2) : null,
          };
        }).filter(Boolean) as NonNullable<typeof speedData[number]>[];

        if (!speedData.length || !speedData.some(s => s.medST || s.medI1 || s.medI2)) return null;

        // Find which speed columns have data
        const hasST = speedData.some(s => s.medST != null);
        const hasI1 = speedData.some(s => s.medI1 != null);
        const hasI2 = speedData.some(s => s.medI2 != null);
        const cols: { key: "ST" | "I1" | "I2"; label: string; getMed: (s: typeof speedData[0]) => number | null; getMax: (s: typeof speedData[0]) => number | null; color: string }[] = [];
        if (hasST) cols.push({ key: "ST", label: "Speed Trap", getMed: s => s.medST, getMax: s => s.maxST, color: "#e10600" });
        if (hasI1) cols.push({ key: "I1", label: "Intermediate 1", getMed: s => s.medI1, getMax: s => s.maxI1, color: "#fbbf24" });
        if (hasI2) cols.push({ key: "I2", label: "Intermediate 2", getMed: s => s.medI2, getMax: s => s.maxI2, color: "#a855f7" });

        // Sort by highest median speed trap (or first available)
        const sortCol = cols[0];
        speedData.sort((a, b) => (sortCol.getMed(b) || 0) - (sortCol.getMed(a) || 0));

        const topMeds = cols.map(c => Math.max(...speedData.map(s => c.getMed(s) || 0)));
        const minMeds = cols.map(c => Math.min(...speedData.filter(s => c.getMed(s) != null).map(s => c.getMed(s)!)));

        return (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Speed Trap Analysis (km/h)
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
              Median and peak speeds at each measurement point. Higher = more straight-line power or lower drag. The bar shows relative speed within the field.
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...sty.th, textAlign: "left" }}>Driver</th>
                    {cols.map(c => (
                      <th key={c.key} colSpan={2} style={{ ...sty.th, textAlign: "center", color: c.color }}>{c.label}</th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...sty.th }}></th>
                    {cols.map(c => (
                      <React.Fragment key={c.key}>
                        <th style={{ ...sty.th, textAlign: "right", fontSize: 9 }}>Median</th>
                        <th style={{ ...sty.th, textAlign: "right", fontSize: 9 }}>Peak</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {speedData.map((s, i) => (
                    <tr key={s.driver.driver_number} style={rowBg(i)}>
                      <td style={{ ...sty.td, borderLeft: "3px solid #" + s.color, paddingLeft: 12, fontWeight: 600 }}>
                        {s.driver.name_acronym}
                      </td>
                      {cols.map((c, ci) => {
                        const med = c.getMed(s);
                        const max = c.getMax(s);
                        const isTopMed = med != null && med === topMeds[ci];
                        return (
                          <React.Fragment key={c.key}>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", position: "relative" as const }}>
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: med != null && minMeds[ci] < topMeds[ci] ? ((med - minMeds[ci]) / (topMeds[ci] - minMeds[ci]) * 100) + "%" : "0%",
                                background: c.color, opacity: 0.08,
                              }} />
                              <span style={{
                                position: "relative",
                                fontWeight: isTopMed ? 700 : 400,
                                color: isTopMed ? c.color : "#b0b0c0",
                              }}>{med?.toFixed(0) ?? "—"}</span>
                            </td>
                            <td style={{
                              ...sty.td, ...sty.mono, textAlign: "right",
                              color: max != null && max === Math.max(...speedData.map(x => c.getMax(x) || 0)) ? "#22c55e" : "#5a5a6e",
                              fontSize: 10,
                            }}>{max?.toFixed(0) ?? "—"}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Sector Consistency — coefficient of variation */}
      {(() => {
        const consistencyData = data.results.map(r => {
          const s1Spread = r.medS1 > 0 ? ((r.medS1 - r.bestS1) / r.medS1) * 100 : 0;
          const s2Spread = r.medS2 > 0 ? ((r.medS2 - r.bestS2) / r.medS2) * 100 : 0;
          const s3Spread = r.medS3 > 0 ? ((r.medS3 - r.bestS3) / r.medS3) * 100 : 0;
          const avgSpread = (s1Spread + s2Spread + s3Spread) / 3;
          return { ...r, s1Spread, s2Spread, s3Spread, avgSpread };
        }).sort((a, b) => a.avgSpread - b.avgSpread);

        const maxSpread = Math.max(...consistencyData.map(r => Math.max(r.s1Spread, r.s2Spread, r.s3Spread)), 0.01);

        return (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Sector Consistency
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
              How much variation between a driver's best and median sector time (lower = more consistent). Consistent drivers extract more from their car; high variance suggests mistakes or inconsistent conditions.
            </div>
            {consistencyData.map((r, i) => (
              <div key={r.driver.driver_number} style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 3, padding: "3px 0",
              }}>
                <div style={{
                  width: 22, textAlign: "right", fontWeight: 800, fontSize: 11,
                  color: podiumColor(i), fontFamily: F, flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{
                  width: 44, fontWeight: 700, fontSize: 11, fontFamily: F,
                  color: "#" + r.color, flexShrink: 0,
                }}>{r.driver.name_acronym}</div>
                <div style={{ flex: 1, display: "flex", gap: 2, alignItems: "center" }}>
                  {[r.s1Spread, r.s2Spread, r.s3Spread].map((spread, si) => (
                    <div key={si} style={{ flex: 1, position: "relative", height: 14 }}>
                      <div style={{
                        position: "absolute", top: 0, left: 0,
                        width: "100%", height: 14, borderRadius: 3,
                        background: "rgba(255,255,255,0.02)",
                      }} />
                      <div style={{
                        position: "absolute", top: 0, left: 0,
                        width: Math.max(2, (spread / maxSpread) * 100) + "%",
                        height: 14, borderRadius: 3,
                        background: spread < 0.3 ? "rgba(34,197,94,0.4)" : spread < 0.6 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)",
                      }} />
                      <div style={{
                        position: "absolute", top: 1, right: 4,
                        fontSize: 8, fontFamily: M, fontWeight: 600,
                        color: spread < 0.3 ? "#22c55e" : spread < 0.6 ? "#fbbf24" : "#ef4444",
                      }}>{spread.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  fontFamily: M, fontSize: 10, fontWeight: 600, flexShrink: 0, width: 48, textAlign: "right",
                  color: r.avgSpread < 0.3 ? "#22c55e" : r.avgSpread < 0.6 ? "#fbbf24" : "#ef4444",
                }}>
                  {r.avgSpread.toFixed(2)}%
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 9, color: "#5a5a6e" }}>
              {S_NAMES.map((n, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: S_COLORS[i], opacity: 0.6 }} />
                  <span>{n}</span>
                </div>
              ))}
              <span style={{ marginLeft: "auto" }}>Lower % = more consistent</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// FUEL CONSUMPTION VISUALIZATION

function FuelVisualization({ allLaps, drivers }: { allLaps: Lap[]; drivers: Driver[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { show: fuelShow, hide: fuelHide, el: fuelTipEl } = useTooltip(wrapRef);

  const totalRaceLaps = useMemo(() => Math.max(...allLaps.map(l => l.lap_number), 1), [allLaps]);
  const fuelPerLap = FUEL_TOTAL_KG / totalRaceLaps;
  const fuelCorrectionPerLap = fuelPerLap * FUEL_SEC_PER_KG;

  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = 300;
    cv.width = cssW * dpr;
    cv.height = cssH * dpr;
    cv.style.width = cssW + "px";
    cv.style.height = cssH + "px";
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const LEFT = 60;
    const RIGHT = 16;
    const TOP = 20;
    const BOT = 36;
    const plotW = cssW - LEFT - RIGHT;
    const plotH = cssH - TOP - BOT;

    // Background
    ctx.fillStyle = "rgba(10,10,20,0.5)";
    ctx.fillRect(0, 0, cssW, cssH);

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT, TOP);
    ctx.lineTo(LEFT, TOP + plotH);
    ctx.lineTo(LEFT + plotW, TOP + plotH);
    ctx.stroke();

    // Y-axis: fuel (0 to 110 kg)
    const maxFuel = FUEL_TOTAL_KG;
    ctx.fillStyle = "#5a5a6e";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let kg = 0; kg <= maxFuel; kg += 20) {
      const y = TOP + plotH - (kg / maxFuel) * plotH;
      ctx.fillText(kg + " kg", LEFT - 6, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(LEFT + plotW, y);
      ctx.stroke();
    }

    // X-axis: laps
    ctx.textAlign = "center";
    ctx.fillStyle = "#5a5a6e";
    const step = totalRaceLaps > 50 ? 10 : totalRaceLaps > 20 ? 5 : 2;
    for (let lap = 0; lap <= totalRaceLaps; lap += step) {
      const x = LEFT + (lap / totalRaceLaps) * plotW;
      ctx.fillText("L" + lap, x, TOP + plotH + 16);
    }

    // Fuel load curve
    ctx.strokeStyle = "#e10600";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let lap = 0; lap <= totalRaceLaps; lap++) {
      const fuel = maxFuel - lap * fuelPerLap;
      const x = LEFT + (lap / totalRaceLaps) * plotW;
      const y = TOP + plotH - (fuel / maxFuel) * plotH;
      if (lap === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Time correction curve (right y-axis, mapped to 0 - max correction seconds)
    const maxCorrection = totalRaceLaps * fuelCorrectionPerLap;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let lap = 0; lap <= totalRaceLaps; lap++) {
      const correction = lap * fuelCorrectionPerLap;
      const x = LEFT + (lap / totalRaceLaps) * plotW;
      const y = TOP + plotH - (correction / maxCorrection) * plotH;
      if (lap === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Right y-axis labels (time gain)
    ctx.textAlign = "left";
    ctx.fillStyle = "#a855f7";
    for (let s = 0; s <= maxCorrection; s += Math.ceil(maxCorrection / 5)) {
      const y = TOP + plotH - (s / maxCorrection) * plotH;
      ctx.fillText(s.toFixed(1) + "s", LEFT + plotW + 4, y + 3);
    }

    // Legend
    ctx.font = "11px 'Inter', sans-serif";
    const legendY = TOP + 8;
    ctx.fillStyle = "#e10600";
    ctx.fillRect(LEFT + 10, legendY - 4, 16, 3);
    ctx.fillStyle = "#b0b0c0";
    ctx.textAlign = "left";
    ctx.fillText("Fuel Load (kg)", LEFT + 32, legendY);

    ctx.strokeStyle = "#a855f7";
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(LEFT + 150, legendY - 3);
    ctx.lineTo(LEFT + 166, legendY - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#b0b0c0";
    ctx.fillText("Cumulative Time Gain (s)", LEFT + 172, legendY);

  }, [totalRaceLaps, fuelPerLap, fuelCorrectionPerLap]);

  const onFuelHover = useCallback((e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const cssW = wrap.clientWidth;
    const LEFT = 60, RIGHT = 16;
    const plotW = cssW - LEFT - RIGHT;
    const lapFrac = (mx - LEFT) / plotW;
    if (lapFrac < 0 || lapFrac > 1) { fuelHide(); return; }
    const lap = Math.round(lapFrac * totalRaceLaps);
    const fuel = FUEL_TOTAL_KG - lap * fuelPerLap;
    const timeGain = lap * fuelCorrectionPerLap;
    fuelShow(e, (
      <div>
        <div style={{ fontWeight: 700, color: "#e10600", marginBottom: 4 }}>Lap {lap}</div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
          <span style={{ color: "#e10600" }}>Fuel</span><span>{fuel.toFixed(1)} kg</span>
          <span style={{ color: "#a855f7" }}>Time Gain</span><span>{timeGain.toFixed(2)}s</span>
          <span style={{ color: "#5a5a6e" }}>Lap Effect</span><span>{fuelCorrectionPerLap.toFixed(4)}s/lap</span>
        </div>
      </div>
    ));
  }, [totalRaceLaps, fuelPerLap, fuelCorrectionPerLap, fuelShow, fuelHide]);

  return (
    <div>
      <div ref={wrapRef} style={{ width: "100%", marginBottom: 16, position: "relative" }}>
        {fuelTipEl}
        <canvas ref={cvRef} onMouseMove={onFuelHover} onMouseLeave={fuelHide} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {[
          { label: "Total Fuel", value: FUEL_TOTAL_KG + " kg", color: "#e10600" },
          { label: "Race Laps", value: String(totalRaceLaps), color: "#b0b0c0" },
          { label: "Fuel per Lap", value: fuelPerLap.toFixed(2) + " kg", color: "#b0b0c0" },
          { label: "Time per kg", value: FUEL_SEC_PER_KG + " s/kg", color: "#b0b0c0" },
          { label: "Time per Lap (fuel)", value: fuelCorrectionPerLap.toFixed(4) + " s", color: "#a855f7" },
          { label: "Total Time Gain", value: (totalRaceLaps * fuelCorrectionPerLap).toFixed(1) + " s", color: "#22c55e" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "rgba(10,14,20,0.5)", borderRadius: 8, padding: "10px 14px",
          }}>
            <div style={sty.statLabel}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: M, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

//MAIN RACE ANALYSIS COMPONENT

export default function RaceAnalysis({ sessionKey, drivers, weather, raceControl = [], results = [] }: {
  sessionKey: string;
  drivers: Driver[];
  weather: Weather[];
  raceControl?: any[];
  results?: any[];
}) {
  const [allLaps, setAllLaps] = useState<Lap[]>([]);
  const [allStints, setAllStints] = useState<Stint[]>([]);
  const [allPits, setAllPits] = useState<Pit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [subTab, setSubTab] = useState("pace");
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");
  const [progress, setProgress] = useState("");

  const driverCount = useMemo(() => new Set(allLaps.map(l => l.driver_number)).size, [allLaps]);

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
          ["pace", "Race Pace"],
          ["sectors", "Sectors"],
          ["constructors", "Constructors"],
          ["evolution", "Lap Evolution"],
          ["degradation", "Tire Deg"],
          ["fuel", "Fuel"],
          ["dirtyair", "Dirty Air"],
          ["teammates", "Teammates"],
          ["pitstops", "Pit Stops"],
          ["weather", "Weather"],
        ] as const).map(([k, v]) => (
          <SubTab key={k} active={subTab === k} onClick={() => setSubTab(k)}>{v}</SubTab>
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

      {subTab === "pace" && (
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
      )}

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

      {subTab === "degradation" && (
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
      )}

      {subTab === "teammates" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Teammate Pace Comparison</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Same car, different drivers — who was faster? Compares teammates on laps where both set a clean time, revealing driver vs. car performance.
          </p>
          <TeammateDelta allLaps={allLaps} drivers={drivers} />
        </div>
      )}

      {subTab === "pitstops" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Pit Stop Efficiency</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Which pit crew was fastest? Teams ranked by average time stationary in the pit box.
          </p>
          <PitStopRanking pits={allPits} drivers={drivers} />
        </div>
      )}

      {subTab === "constructors" && (
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
      )}

      {subTab === "weather" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Weather Correlation</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            Did hotter track temps slow everyone down? Shows how lap times changed with temperature, and which drivers adapted best to changing conditions.
          </p>
          <WeatherCorrelation allLaps={allLaps} drivers={drivers} weather={weather} />
        </div>
      )}

      {subTab === "dirtyair" && (
        <div style={sty.card}>
          <div style={{ ...sty.sectionHead, marginBottom: 14 }}>Dirty Air Analysis</div>
          <p style={{ fontSize: 11, color: "#5a5a6e", marginBottom: 12, lineHeight: 1.5 }}>
            When a car follows within {DIRTY_AIR_THRESHOLD}s of another, it loses downforce from turbulent air — this is "dirty air". Below shows when each driver was stuck in traffic, who they were behind, and how much time they lost per lap as a result. Time loss is fuel-corrected and compared against each driver's own clean-air pace to isolate the effect.
          </p>
          <DirtyAirAnalysis allLaps={allLaps} drivers={drivers} stints={allStints} />
        </div>
      )}
    </div>
  );
}
