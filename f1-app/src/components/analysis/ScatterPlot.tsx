import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { F, M } from "../../lib/styles";
import { initCanvas, drawWatermark } from "../../lib/canvas";
import useTooltip from "./useTooltip";
import type { ScatterPoint } from "./useTooltip";
import ShareButton from "../ShareButton";

export type { ScatterPoint };

const defaultFmt = (v: number) => v.toFixed(2);

function ScatterPlot({ data, xLabel, yLabel, xFmt, yFmt, diagonal }: {
  data: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  diagonal?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { show, hide, el } = useTooltip(wrapRef);
  const CSS_H = 280;
  // Store formatters in refs to avoid re-rendering canvas on every parent render
  const xFRef = useRef(xFmt || defaultFmt);
  const yFRef = useRef(yFmt || defaultFmt);
  xFRef.current = xFmt || defaultFmt;
  yFRef.current = yFmt || defaultFmt;

  // Compute bounds from data values (stable if data values don't change)
  const boundsKey = useMemo(() => data.map(d => d.x + "," + d.y).join("|"), [data]);
  const bounds = useMemo(() => {
    if (!data.length) return null;
    const xs = data.map(d => d.x);
    const ys = data.map(d => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xPad = (xMax - xMin) * 0.08 || 0.1;
    const yPad = (yMax - yMin) * 0.08 || 0.1;
    return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad };
  }, [boundsKey]);

  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !bounds) return;
    const xF = xFRef.current, yF = yFRef.current;
    const { ctx, W, H } = initCanvas(cv, wrap, CSS_H);
    const L = 56, R = 16, T = 12, B = 38;
    const pW = W - L - R, pH = H - T - B;
    const { xMin, xMax, yMin, yMax } = bounds;

    const toX = (v: number) => L + ((v - xMin) / (xMax - xMin)) * pW;
    const toY = (v: number) => T + pH - ((v - yMin) / (yMax - yMin)) * pH;

    // Background
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0d1119";
    ctx.fillRect(L, T, pW, pH);

    // Grid
    ctx.strokeStyle = "rgba(99,130,191,.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    const xSteps = 5, ySteps = 5;
    for (let i = 0; i <= xSteps; i++) {
      const v = xMin + ((xMax - xMin) * i) / xSteps;
      const x = toX(v);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + pH); ctx.stroke();
    }
    for (let i = 0; i <= ySteps; i++) {
      const v = yMin + ((yMax - yMin) * i) / ySteps;
      const y = toY(v);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pW, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = "#2a3a5c";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + pH); ctx.lineTo(L + pW, T + pH); ctx.stroke();

    // Diagonal reference line (for best vs median etc.)
    if (diagonal) {
      const dMin = Math.max(xMin, yMin), dMax = Math.min(xMax, yMax);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(toX(dMin), toY(dMin)); ctx.lineTo(toX(dMax), toY(dMax)); ctx.stroke();
      ctx.setLineDash([]);
    }

    // X labels
    ctx.font = "9px " + M;
    ctx.fillStyle = "#3d4f6f";
    ctx.textAlign = "center";
    for (let i = 0; i <= xSteps; i++) {
      const v = xMin + ((xMax - xMin) * i) / xSteps;
      ctx.fillText(xF(v), toX(v), T + pH + 16);
    }
    // Y labels
    ctx.textAlign = "right";
    for (let i = 0; i <= ySteps; i++) {
      const v = yMin + ((yMax - yMin) * i) / ySteps;
      ctx.fillText(yF(v), L - 5, toY(v) + 3);
    }

    // Axis titles
    ctx.font = "600 10px " + F;
    ctx.fillStyle = "#6b7d9e";
    ctx.textAlign = "center";
    ctx.fillText(xLabel, L + pW / 2, H - 4);
    ctx.save();
    ctx.translate(12, T + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Points
    data.forEach(d => {
      const x = toX(d.x), y = toY(d.y);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#" + d.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Labels
    ctx.font = "bold 8px " + F;
    ctx.textAlign = "left";
    data.forEach(d => {
      const x = toX(d.x), y = toY(d.y);
      ctx.fillStyle = "#" + d.color;
      ctx.fillText(d.label, x + 7, y + 3);
    });
    drawWatermark(ctx, W, H);
  }, [boundsKey, bounds, xLabel, yLabel, diagonal]);

  const onHover = useCallback((e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || !bounds) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const L = 56, R = 16, T = 12, B = 38;
    const pW = wrap.clientWidth - L - R, pH = CSS_H - T - B;
    const { xMin, xMax, yMin, yMax } = bounds;

    let closest: ScatterPoint | null = null;
    let minDist = Infinity;
    data.forEach(d => {
      const px = L + ((d.x - xMin) / (xMax - xMin)) * pW;
      const py = T + pH - ((d.y - yMin) / (yMax - yMin)) * pH;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < minDist && dist < 30) { minDist = dist; closest = d; }
    });
    if (!closest) { hide(); return; }
    show(e, (
      <div>
        <div style={{ fontWeight: 700, color: "#" + closest.color, marginBottom: 4, fontFamily: F }}>{closest.label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "2px 10px", fontSize: 10 }}>
          <span style={{ color: "#5a5a6e" }}>{xLabel}</span><span>{xFRef.current(closest.x)}</span>
          <span style={{ color: "#5a5a6e" }}>{yLabel}</span><span>{yFRef.current(closest.y)}</span>
        </div>
      </div>
    ));
  }, [data, bounds, xLabel, yLabel, show, hide]);

  if (!data.length) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {el}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
        <ShareButton canvasRef={cvRef} filename="openf1ow-scatter" />
      </div>
      <canvas ref={cvRef} style={{ display: "block", borderRadius: 8 }} onMouseMove={onHover} onMouseLeave={hide} />
    </div>
  );
}

export default ScatterPlot;
