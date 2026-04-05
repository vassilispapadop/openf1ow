import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M } from "../../lib/styles";
import { initCanvas } from "../../lib/canvas";
import { ft1 } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap } from "../../lib/raceUtils";
import { DRIVER_COLORS } from "../../lib/constants";

// Chart helpers
const LEFT_MARGIN = 56;
const RIGHT_PAD = 16;
const X_AXIS_H = 32;

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

export default LapEvolutionChart;
