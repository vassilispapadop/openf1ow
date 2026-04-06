import { useEffect, useCallback, useRef, useMemo } from "react";
import { F, M } from "../lib/styles";
import { DRS_OPEN, DRS_ELIGIBLE } from "../lib/constants";
import { initCanvas, getCtx } from "../lib/canvas";
import ShareButton from "./ShareButton";
import type { ClipEvent } from "../lib/clipping";

// ============================================================================
// CHART INFRASTRUCTURE
// ============================================================================

// Color palette
const C = {
  bg: "#0a0e14",
  panel1: "#0d1119",
  panel2: "#0f131d",
  border: "#1c2333",
  grid: "rgba(99,130,191,.07)",
  gridStrong: "rgba(99,130,191,.15)",
  axis: "#2a3a5c",
  tick: "#3d4f6f",
  text: "#6b7d9e",
  bright: "#c8d6e5",
  dim: "#3d4f6f",
  accent: "#e63946",
};

// Layout constants
const LEFT_MARGIN = 52;
const RIGHT_PAD = 14;
const X_AXIS_H = 28;

// --- Shared drawing helpers ---

function drawGrid(ctx, W, H, maxDist, plotTop, plotH) {
  const L = LEFT_MARGIN;
  const R = RIGHT_PAD;
  const plotW = W - L - R;
  const step = Math.ceil(maxDist / 6 / 1000) * 1000;
  ctx.save();
  for (let d = 0; d <= maxDist; d += step) {
    const x = L + (d / maxDist) * plotW;
    if (d > 0 && d < maxDist) {
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotTop + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = C.tick;
    ctx.font = "10px " + M;
    ctx.textAlign = "center";
    ctx.fillText(d >= 1000 ? (d / 1000).toFixed(1) + "km" : d + "m", x, plotTop + plotH + 18);
  }
  // L-shaped axis border
  ctx.setLineDash([]);
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L, plotTop);
  ctx.lineTo(L, plotTop + plotH);
  ctx.lineTo(W - R, plotTop + plotH);
  ctx.stroke();
  ctx.restore();
}

function drawLegend(ctx, W, traces, y0) {
  const R = RIGHT_PAD;
  ctx.save();
  ctx.textAlign = "left";
  traces.forEach((t, i) => {
    const y = y0 + i * 22;
    ctx.font = "600 10px " + F;
    const tw = ctx.measureText(t.label).width;
    const pillW = tw + 30;
    const pillH = 18;
    const px = W - R - 6 - pillW;
    // Pill background
    ctx.fillStyle = "rgba(10,14,20,.85)";
    ctx.beginPath();
    ctx.roundRect(px, y, pillW, pillH, 9);
    ctx.fill();
    // Colored left edge bar
    ctx.fillStyle = "#" + t.color;
    ctx.beginPath();
    ctx.roundRect(px, y, 4, pillH, [9, 0, 0, 9]);
    ctx.fill();
    // Dot
    ctx.beginPath();
    ctx.arc(px + 14, y + pillH / 2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#" + t.color;
    ctx.fill();
    // Label
    ctx.fillStyle = C.bright;
    ctx.fillText(t.label, px + 22, y + 13);
  });
  ctx.restore();
}

function drawGlowLine(ctx, col, pts, lineWidth = 1.6) {
  ctx.beginPath();
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.12;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.strokeStyle = col;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = 0.92;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDot(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#" + color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#" + color;
  ctx.fill();
}

function drawTooltip(ctx, mx, byY, W, header, rows, colors) {
  const pad = 10;
  const lineH = 19;
  const headerH = 16;
  const topStrip = 3;

  ctx.save();
  ctx.font = "10px " + M;

  // Measure columns
  const numCols = rows.length > 0 ? rows[0].cols.length : 0;
  const colWidths: number[] = [];
  for (let ci = 0; ci < numCols; ci++) {
    let maxW = 0;
    rows.forEach(r => {
      const w = ctx.measureText(r.cols[ci] || "").width;
      if (w > maxW) maxW = w;
    });
    colWidths.push(maxW);
  }
  const colGap = 14;
  const dotSpace = 16;
  const contentW = dotSpace + colWidths.reduce((s, w) => s + w + colGap, 0);
  ctx.font = "9px " + F;
  const headerW = ctx.measureText(header).width;
  const boxW = Math.max(contentW, headerW) + pad * 2 + 4;
  const boxH = topStrip + pad + headerH + rows.length * lineH + pad;

  let bx = mx + 18;
  if (bx + boxW > W - 8) bx = mx - boxW - 18;
  if (bx < 8) bx = 8;
  const by = Math.max(byY - boxH / 2, 8);

  // Drop shadow
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(10,14,20,.94)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 6);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 6);
  ctx.stroke();

  // Accent-red top strip
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, topStrip, [6, 6, 0, 0]);
  ctx.fill();

  // Header
  ctx.fillStyle = C.text;
  ctx.font = "9px " + F;
  ctx.textAlign = "left";
  ctx.fillText(header, bx + pad, by + topStrip + pad + 10);

  // Rows (tabular)
  ctx.font = "10px " + M;
  rows.forEach((row, ri) => {
    const ry = by + topStrip + pad + headerH + ri * lineH + 13;
    // Color dot
    if (colors[ri]) {
      ctx.fillStyle = "#" + colors[ri];
      ctx.beginPath();
      ctx.arc(bx + pad + 5, ry - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Columns
    let cx = bx + pad + dotSpace;
    row.cols.forEach((col, ci) => {
      if (row.highlight && row.highlight[ci]) {
        ctx.fillStyle = row.highlight[ci];
      } else {
        ctx.fillStyle = C.bright;
      }
      ctx.fillText(col, cx, ry);
      cx += colWidths[ci] + colGap;
    });
  });

  ctx.restore();
}

// --- Panel definitions ---

const PANELS = [
  { key: "speed", label: "SPEED", frac: 0.38, get: d => d.speed, autoMax: true },
  { key: "throttle", label: "THROTTLE", frac: 0.18, get: d => d.throttle, max: 100 },
  { key: "brake", label: "BRAKE", frac: 0.12, get: d => d.brake ? 1 : 0, max: 1, isBrake: true },
  { key: "gear", label: "GEAR", frac: 0.14, get: d => d.n_gear, max: 8 },
  { key: "drs", label: "DRS", frac: 0.06, isDrs: true, max: 1 },
];

// ============================================================================
// CHART COMPONENT
// ============================================================================

export function Chart({ traces, syncRef, clippingEvents }: { traces: any; syncRef: any; clippingEvents?: ClipEvent[] }) {
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const olRef = useRef(null);
  const scalesRef = useRef({ maxDist: 1, panels: [], L: LEFT_MARGIN, plotW: 1, plotH: 1 });
  const CSS_H = 460;

  // Draw static background
  useEffect(() => {
    const cv = bgRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !traces.length || !traces.some(t => t.data.length)) return;

    const { ctx, W, H } = initCanvas(cv, wrap, CSS_H);
    // Also size overlay
    initCanvas(olRef.current, wrap, CSS_H);

    const L = LEFT_MARGIN;
    const R = RIGHT_PAD;
    const plotW = W - L - R;
    const plotH = H - X_AXIS_H;

    // Compute max distance and speed ceiling
    let maxDist = 1, maxSpd = 1;
    for (const t of traces) for (const d of t.data) {
      if ((d.distance ?? 0) > maxDist) maxDist = d.distance;
      if (d.speed > maxSpd) maxSpd = d.speed;
    }
    const spdCeil = Math.ceil(maxSpd / 50) * 50;

    // Compute panel positions
    const panels: any[] = [];
    let yOff = 0;
    PANELS.forEach(p => {
      const h = plotH * p.frac;
      panels.push({
        ...p,
        y0: yOff,
        h,
        computedMax: p.autoMax ? spdCeil : p.max,
      });
      yOff += h;
    });
    scalesRef.current = { maxDist, panels, L, R, plotW, plotH, W, H };

    const xPos = (dist) => L + (dist / maxDist) * plotW;

    // Fill entire background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Draw alternating panel backgrounds and labels
    panels.forEach((p, pi) => {
      // Alternating panel1/panel2
      ctx.fillStyle = pi % 2 === 0 ? C.panel1 : C.panel2;
      ctx.fillRect(L, p.y0, plotW, p.h);

      // Panel separator
      if (pi > 0) {
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L, p.y0);
        ctx.lineTo(W - R, p.y0);
        ctx.stroke();
      }

      // Panel label (left column)
      ctx.save();
      ctx.fillStyle = C.text;
      ctx.font = "700 9px " + F;
      ctx.textAlign = "left";
      ctx.letterSpacing = "1px";
      ctx.fillText(p.label, 4, p.y0 + p.h / 2 + 3);
      ctx.letterSpacing = "0px";
      ctx.restore();

      // Y-axis ticks per panel
      ctx.font = "9px " + M;
      ctx.textAlign = "right";
      ctx.fillStyle = C.tick;

      if (p.key === "speed") {
        const step = spdCeil <= 200 ? 50 : 100;
        for (let v = 0; v <= spdCeil; v += step) {
          const y = p.y0 + p.h - (v / spdCeil) * (p.h - 6) - 2;
          ctx.fillText(String(v), L - 5, y + 3);
          if (v > 0) {
            ctx.save();
            ctx.strokeStyle = C.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(L, y);
            ctx.lineTo(W - R, y);
            ctx.stroke();
            ctx.restore();
          }
        }
      } else if (p.key === "throttle") {
        [0, 50, 100].forEach(v => {
          const y = p.y0 + p.h - (v / 100) * (p.h - 4) - 2;
          ctx.fillText(String(v), L - 5, y + 3);
          if (v > 0 && v < 100) {
            ctx.save();
            ctx.strokeStyle = C.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(L, y);
            ctx.lineTo(W - R, y);
            ctx.stroke();
            ctx.restore();
          }
        });
      } else if (p.key === "gear") {
        [2, 4, 6, 8].forEach(v => {
          const y = p.y0 + p.h - (v / 8) * (p.h - 4) - 2;
          ctx.fillText(String(v), L - 5, y + 3);
        });
      }
    });

    // X-axis grid + labels
    drawGrid(ctx, W, H, maxDist, 0, plotH);

    // Draw traces
    const singleTrace = traces.length === 1;

    traces.forEach((trace) => {
      const { data, color } = trace;
      const n = data.length;
      if (!n) return;
      const col = "#" + color;

      panels.forEach(p => {
        if (p.isDrs) {
          for (let i = 0; i < n; i++) {
            const drs = data[i].drs;
            const isOpen = DRS_OPEN.includes(drs);
            const isEligible = drs === DRS_ELIGIBLE;
            if (isOpen || isEligible) {
              const x0 = xPos(data[i].distance ?? 0);
              const x1 = i < n - 1 ? xPos(data[i + 1].distance ?? 0) : x0 + 2;
              ctx.fillStyle = isOpen ? "#39B54A" : "#FFD700";
              ctx.globalAlpha = singleTrace ? 0.5 : 0.35;
              ctx.fillRect(x0, p.y0 + 1, Math.max(x1 - x0, 1.5), p.h - 2);
              ctx.globalAlpha = 1;
            }
          }
          return;
        }

        if (p.isBrake) {
          for (let i = 0; i < n; i++) {
            if (data[i].brake) {
              const x0 = xPos(data[i].distance ?? 0);
              const x1 = i < n - 1 ? xPos(data[i + 1].distance ?? 0) : x0 + 2;
              ctx.fillStyle = col;
              ctx.globalAlpha = 0.4;
              ctx.fillRect(x0, p.y0 + 1, Math.max(x1 - x0, 1.5), p.h - 2);
              ctx.globalAlpha = 1;
            }
          }
          return;
        }

        // Build path points
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          const x = xPos(data[i].distance ?? 0);
          const v = p.get(data[i]);
          const y = p.y0 + p.h - (v / p.computedMax) * (p.h - 6) - 2;
          pts.push({ x, y });
        }

        // Gradient area fill for single trace
        if (singleTrace && (p.key === "speed" || p.key === "throttle")) {
          const grad = ctx.createLinearGradient(0, p.y0, 0, p.y0 + p.h);
          grad.addColorStop(0, col.slice(0, 7) + "18");
          grad.addColorStop(1, col.slice(0, 7) + "02");
          ctx.beginPath();
          ctx.moveTo(pts[0].x, p.y0 + p.h - 2);
          pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
          ctx.lineTo(pts[pts.length - 1].x, p.y0 + p.h - 2);
          ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
        }

        drawGlowLine(ctx, col, pts, 1.6);
      });
    });

    // Legend
    drawLegend(ctx, W, traces, 8);

    // Super Clipping overlay zones
    if (clippingEvents?.length) {
      clippingEvents.forEach(evt => {
        const x = xPos(evt.distance);
        const bandW = Math.max(plotW * 0.018, 8);
        // Semi-transparent yellow fill across all panels
        ctx.fillStyle = "rgba(234, 179, 8, 0.07)";
        ctx.fillRect(x - bandW / 2, 0, bandW, plotH);
        // Dashed yellow borders
        ctx.save();
        ctx.strokeStyle = "rgba(234, 179, 8, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x - bandW / 2, 0);
        ctx.lineTo(x - bandW / 2, plotH);
        ctx.moveTo(x + bandW / 2, 0);
        ctx.lineTo(x + bandW / 2, plotH);
        ctx.stroke();
        ctx.restore();
        // Small label at top
        ctx.font = `bold 7px ${M}`;
        ctx.fillStyle = "rgba(234, 179, 8, 0.5)";
        ctx.textAlign = "center";
        ctx.fillText(`-${evt.speedDrop.toFixed(0)}`, x, 10);
      });
    }
  }, [traces, clippingEvents]);

  // Hover overlay drawing function
  const drawOverlay = useCallback((hoverDist) => {
    const ol = olRef.current;
    if (!ol) return;
    const { ctx, W } = getCtx(ol);
    const { maxDist, panels, L, plotW, plotH } = scalesRef.current;
    if (!plotW || !panels.length) return;
    if (hoverDist < 0 || hoverDist > maxDist) return;

    const xLine = L + (hoverDist / maxDist) * plotW;

    // Crosshair
    ctx.strokeStyle = "rgba(200,214,229,.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xLine, 0);
    ctx.lineTo(xLine, plotH);
    ctx.stroke();

    // Find nearest data point per trace via binary search
    const findNearest = (data, targetDist) => {
      let lo = 0, hi = data.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((data[mid].distance ?? 0) < targetDist) lo = mid + 1; else hi = mid;
      }
      if (lo > 0 && Math.abs((data[lo - 1].distance ?? 0) - targetDist) < Math.abs((data[lo].distance ?? 0) - targetDist)) lo--;
      return data[lo];
    };

    const points = traces.map(t => {
      if (!t.data.length) return null;
      return { ...findNearest(t.data, hoverDist), color: t.color, label: t.label };
    }).filter(Boolean);

    // Dots on speed/throttle/gear panels
    let midY = plotH / 2;
    points.forEach(p => {
      const px = L + ((p.distance ?? 0) / maxDist) * plotW;
      panels.forEach(panel => {
        if (panel.isBrake || panel.isDrs) return;
        const v = panel.get(p);
        const y = panel.y0 + panel.h - (v / panel.computedMax) * (panel.h - 6) - 2;
        drawDot(ctx, px, y, p.color);
        if (panel.key === "speed") midY = y;
      });
    });

    // Tooltip
    if (points.length) {
      const header = Math.round(hoverDist).toLocaleString() + "m";
      const colHeaders = { cols: ["", "SPD", "THR", "GEAR", "BRK", "RPM"], highlight: { 0: C.text, 1: C.text, 2: C.text, 3: C.text, 4: C.text, 5: C.text } };
      const rows = [colHeaders];
      points.forEach(p => {
        rows.push({
          cols: [
            p.label,
            String(p.speed || 0),
            String(p.throttle || 0) + "%",
            String(p.n_gear || 0),
            p.brake ? "ON" : "--",
            String(p.rpm || 0),
          ],
        });
      });
      // Check if hovering near a clipping zone
      const clipEvt = clippingEvents?.find(e => Math.abs(e.distance - hoverDist) < (maxDist * 0.015));
      if (clipEvt) {
        rows.push({ cols: ["CLIP", `-${clipEvt.speedDrop.toFixed(1)}`, `${clipEvt.startSpeed.toFixed(0)}→${clipEvt.endSpeed.toFixed(0)}`, "", "", ""], highlight: { 0: "#eab308", 1: "#eab308", 2: "#eab308" } });
      }

      drawTooltip(ctx, xLine, midY, W, header, rows, ["", ...points.map(p => p.color), ...(clipEvt ? [""] : [])]);
    }
  }, [traces, clippingEvents]);

  // Register syncRef and attach mouse handlers
  useEffect(() => {
    if (syncRef) {
      syncRef.current.chart = drawOverlay;
    }
  }, [syncRef, drawOverlay]);

  useEffect(() => {
    const ol = olRef.current;
    if (!ol) return;

    const onMove = (e) => {
      const { maxDist, L, plotW } = scalesRef.current;
      if (!plotW) return;
      const rect = ol.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = ol.width / dpr;
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const hoverDist = ((mx - L) / plotW) * maxDist;

      drawOverlay(hoverDist);

      if (syncRef && syncRef.current.delta) {
        syncRef.current.delta(hoverDist);
      }
    };

    const onLeave = () => {
      getCtx(ol);
      if (syncRef && syncRef.current.delta && olRef.current) {
        syncRef.current.delta(-1);
      }
    };

    ol.addEventListener("mousemove", onMove);
    ol.addEventListener("mouseleave", onLeave);
    return () => {
      ol.removeEventListener("mousemove", onMove);
      ol.removeEventListener("mouseleave", onLeave);
    };
  }, [traces, drawOverlay, syncRef]);

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 0 }}>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
        <ShareButton canvasRef={bgRef} filename="openf1ow-telemetry" />
      </div>
      <canvas ref={bgRef} style={{ display: "block", borderRadius: "8px 8px 0 0" }} />
      <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: "8px 8px 0 0" }} />
    </div>
  );
}

// ============================================================================
// DELTA COMPUTATION & CHART
// ============================================================================

function computeDeltas(traces) {
  if (traces.length < 2) return null;
  const series = traces.map(t => {
    const d = t.data;
    if (!d.length) return null;
    const t0 = new Date(d[0].date).getTime();
    return d.map(p => ({ dist: p.distance ?? 0, elapsed: (new Date(p.date).getTime() - t0) / 1000 }));
  }).filter(Boolean);
  if (series.length < 2) return null;

  const maxDist = Math.max(...series.map(s => s[s.length - 1].dist));
  const nPts = 400;
  const grid = Array.from({ length: nPts }, (_, i) => (i / (nPts - 1)) * maxDist);

  const interp = (pts, d) => {
    if (d <= pts[0].dist) return pts[0].elapsed;
    if (d >= pts[pts.length - 1].dist) return pts[pts.length - 1].elapsed;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; pts[mid].dist <= d ? lo = mid : hi = mid; }
    const frac = (d - pts[lo].dist) / (pts[hi].dist - pts[lo].dist || 1);
    return pts[lo].elapsed + frac * (pts[hi].elapsed - pts[lo].elapsed);
  };

  const elapsed = series.map(s => grid.map(d => interp(s, d)));
  const fastest = grid.map((_, i) => Math.min(...elapsed.map(e => e[i])));
  return {
    grid,
    deltas: traces.map((t, ti) => {
      if (!series[ti]) return null;
      let si = 0;
      for (let j = 0; j < ti; j++) { if (traces[j].data.length) si++; }
      return { label: t.label, color: t.color, values: grid.map((_, i) => elapsed[si][i] - fastest[i]) };
    }).filter(Boolean),
  };
}

export function DeltaChart({ traces, syncRef }) {
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const olRef = useRef(null);
  const deltaRef = useRef(null);
  const scalesRef = useRef({ maxDist: 1, deltaCeil: 1, L: LEFT_MARGIN, plotW: 1, plotH: 1, T: 8 });
  const CSS_H = 180;

  useEffect(() => {
    const cv = bgRef.current;
    const wrap = wrapRef.current;
    const result = computeDeltas(traces);
    deltaRef.current = result;
    if (!cv || !wrap || !result) return;
    const { grid, deltas } = result;

    const { ctx, W, H } = initCanvas(cv, wrap, CSS_H);
    initCanvas(olRef.current, wrap, CSS_H);

    const L = LEFT_MARGIN;
    const R = RIGHT_PAD;
    const plotW = W - L - R;
    const T = 8;
    const plotH = H - T - X_AXIS_H;

    const maxDist = grid[grid.length - 1] || 1;
    const maxDelta = Math.max(...deltas.flatMap(d => d.values), 0.05);
    const deltaCeil = maxDelta < 0.2 ? 0.2 : maxDelta < 0.5 ? 0.5 : maxDelta < 1 ? 1 : maxDelta < 2 ? 2 : Math.ceil(maxDelta);

    scalesRef.current = { maxDist, deltaCeil, L, R, plotW, plotH, T, W, H };

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = C.panel2;
    ctx.fillRect(L, T, plotW, plotH);

    // GAP label
    ctx.save();
    ctx.fillStyle = C.text;
    ctx.font = "700 9px " + F;
    ctx.textAlign = "left";
    ctx.letterSpacing = "1px";
    ctx.fillText("GAP", 4, T + plotH / 2 + 3);
    ctx.letterSpacing = "0px";
    ctx.restore();

    // Y-axis ticks
    const yTickStep = deltaCeil <= 0.2 ? 0.1 : deltaCeil <= 0.5 ? 0.1 : deltaCeil <= 1 ? 0.2 : deltaCeil <= 2 ? 0.5 : 1;
    ctx.font = "9px " + M;
    ctx.textAlign = "right";
    for (let v = 0; v <= deltaCeil + 0.001; v += yTickStep) {
      const y = T + (v / deltaCeil) * plotH;
      ctx.fillStyle = C.tick;
      if (v < 1) {
        ctx.fillText(v === 0 ? "0.000" : "+" + v.toFixed(3), L - 5, y + 3);
      } else {
        ctx.fillText("+" + v.toFixed(2), L - 5, y + 3);
      }
      ctx.save();
      ctx.strokeStyle = v === 0 ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(W - R, y);
      ctx.stroke();
      ctx.restore();
    }

    // X-axis grid
    drawGrid(ctx, W, H, maxDist, T, plotH);

    // Draw delta traces
    const singleDelta = deltas.length === 1;

    deltas.forEach(d => {
      const col = "#" + d.color;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < grid.length; i++) {
        const x = L + (grid[i] / maxDist) * plotW;
        const y = T + (d.values[i] / deltaCeil) * plotH;
        pts.push({ x, y });
      }

      if (singleDelta || deltas.length <= 3) {
        const grad = ctx.createLinearGradient(0, T, 0, T + plotH);
        grad.addColorStop(0, col.slice(0, 7) + "14");
        grad.addColorStop(1, col.slice(0, 7) + "02");
        ctx.beginPath();
        ctx.moveTo(pts[0].x, T);
        pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(pts[pts.length - 1].x, T);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      drawGlowLine(ctx, col, pts, 2);
    });

    // Legend
    drawLegend(ctx, W, deltas, T + 6);
  }, [traces]);

  // Hover overlay drawing
  const drawOverlay = useCallback((hoverDist) => {
    const ol = olRef.current;
    if (!ol) return;
    const { ctx, W } = getCtx(ol);
    const result = deltaRef.current;
    if (!result) return;
    const { grid, deltas } = result;
    const { maxDist, deltaCeil, L, plotW, plotH, T } = scalesRef.current;
    if (!plotW) return;
    if (hoverDist < 0 || hoverDist > maxDist) return;

    const xLine = L + (hoverDist / maxDist) * plotW;

    // Find nearest grid index
    let gi = 0, bestDiff = Infinity;
    for (let i = 0; i < grid.length; i++) {
      const diff = Math.abs(grid[i] - hoverDist);
      if (diff < bestDiff) { gi = i; bestDiff = diff; }
    }

    // Crosshair
    ctx.strokeStyle = "rgba(200,214,229,.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xLine, T);
    ctx.lineTo(xLine, T + plotH);
    ctx.stroke();

    // Dots
    let midY = T + plotH / 2;
    deltas.forEach(d => {
      const x = L + (grid[gi] / maxDist) * plotW;
      const y = T + (d.values[gi] / deltaCeil) * plotH;
      midY = y;
      drawDot(ctx, x, y, d.color);
    });

    // Tooltip
    if (deltas.length) {
      const header = Math.round(hoverDist).toLocaleString() + "m";
      const minVal = Math.min(...deltas.map(d => d.values[gi]));
      const rows = deltas.map(d => {
        const val = d.values[gi];
        const isLeader = Math.abs(val - minVal) < 0.0005;
        return {
          cols: [d.label, isLeader ? "LEADER" : "+" + val.toFixed(3) + "s"],
          highlight: isLeader ? { 1: "#22c55e" } : undefined,
        };
      });
      drawTooltip(ctx, xLine, midY, W, header, rows, deltas.map(d => d.color));
    }
  }, [traces]);

  // Register syncRef
  useEffect(() => {
    if (syncRef) {
      syncRef.current.delta = drawOverlay;
    }
  }, [syncRef, drawOverlay]);

  // Mouse handlers
  useEffect(() => {
    const ol = olRef.current;
    if (!ol) return;

    const onMove = (e) => {
      const { maxDist, L, plotW } = scalesRef.current;
      if (!plotW) return;
      const rect = ol.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = ol.width / dpr;
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const hoverDist = ((mx - L) / plotW) * maxDist;

      drawOverlay(hoverDist);

      if (syncRef && syncRef.current.chart) {
        syncRef.current.chart(hoverDist);
      }
    };

    const onLeave = () => {
      getCtx(ol);
      if (syncRef && syncRef.current.chart) {
        syncRef.current.chart(-1);
      }
    };

    ol.addEventListener("mousemove", onMove);
    ol.addEventListener("mouseleave", onLeave);
    return () => {
      ol.removeEventListener("mousemove", onMove);
      ol.removeEventListener("mouseleave", onLeave);
    };
  }, [traces, drawOverlay, syncRef]);

  const hasDeltas = useMemo(() => computeDeltas(traces) !== null, [traces]);
  if (!hasDeltas) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 2 }}>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
        <ShareButton canvasRef={bgRef} filename="openf1ow-gap" />
      </div>
      <canvas ref={bgRef} style={{ display: "block", borderRadius: "0 0 8px 8px" }} />
      <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: "0 0 8px 8px" }} />
    </div>
  );
}
