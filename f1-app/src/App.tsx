import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import RaceAnalysis from "./RaceAnalysis";
import { readParams, useUrlState, type UrlParams } from "./lib/useUrlState";

const PROXY = "https://corsproxy.io/?";
const API = "https://api.openf1.org/v1";

const apiCache: Record<string, unknown> = {};

async function api(path: string, retries = 3) {
  if (apiCache[path]) return apiCache[path];
  const urls = [
    API + path,
    PROXY + encodeURIComponent(API + path)
  ];
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          apiCache[path] = data;
          return data;
        }
      } catch (e) { /* try next */ }
    }
  }
  throw new Error("Failed to fetch: " + path);
}

const ft = (s) => {
  if (s == null) return "\u2014";
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(3);
  return m > 0 ? m + ":" + r.padStart(6, "0") : r + "s";
};
const fs = (s) => (s ? s.toFixed(3) : "\u2014");

const TC = { SOFT: "#FF3333", MEDIUM: "#FFD700", HARD: "#FFFFFF", INTERMEDIATE: "#39B54A", WET: "#0072C6" };

const DRS_OPEN = [10, 12, 14];
const DRS_ELIGIBLE = 8;

/* ============================================================================
   PREMIUM BROADCAST STYLES
   ============================================================================ */

const sty = {
  bg: {
    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    background: "#050508",
    color: "#e8e8ec",
    minHeight: "100vh",
    padding: 0,
    position: "relative" as const,
  },
  card: {
    background: "rgba(12, 12, 24, 0.8)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.05)",
    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
  },
  sel: {
    background: "rgba(16, 16, 32, 0.95)",
    color: "#e0e0e6",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: "11px 36px 11px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    fontWeight: 500,
    outline: "none",
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23e10600'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
  },
  th: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    color: "#4a4a62",
    textAlign: "left" as const,
    position: "sticky" as const,
    top: 0,
    background: "rgba(12, 12, 24, 0.98)",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    backdropFilter: "blur(12px)",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.025)",
    transition: "background 0.15s ease",
  },
  mono: {
    fontFamily: "'JetBrains Mono','SF Mono','Cascadia Code','Consolas',monospace",
  },
  err: {
    background: "rgba(220, 38, 38, 0.1)",
    border: "1px solid rgba(220, 38, 38, 0.15)",
    padding: "14px 18px",
    borderRadius: 12,
    marginBottom: 12,
    fontSize: 13,
    color: "#fca5a5",
    animation: "fadeInUp 0.3s ease-out",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sectionHead: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "1.2px",
  },
};

/* ============================================================================
   TAB COMPONENT - PILL STYLE
   ============================================================================ */

function Tab({ active, onClick, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 18px",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: F,
        textTransform: "uppercase" as const,
        letterSpacing: "0.8px",
        whiteSpace: "nowrap" as const,
        borderRadius: 8,
        background: active
          ? "linear-gradient(135deg, #e10600, #b80500)"
          : hovered ? "rgba(225,6,0,0.08)" : "rgba(255,255,255,0.02)",
        color: active ? "#fff" : hovered ? "#e8e8ec" : "#5a5a6e",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        outline: "none",
        boxShadow: active ? "0 2px 12px rgba(225,6,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
        border: active ? "none" : "1px solid transparent",
      }}>{children}</button>
  );
}

// OpenF1 location x,y are in ~decimeter-scale units; divide by 10 to approximate meters
const LOC_TO_METERS = 10;

function mergeDistance(cd, loc) {
  const locDist = [];
  let cum = 0;
  for (let i = 0; i < loc.length; i++) {
    if (i > 0) {
      const dx = loc[i].x - loc[i - 1].x, dy = loc[i].y - loc[i - 1].y;
      cum += Math.sqrt(dx * dx + dy * dy);
    }
    locDist.push({ t: new Date(loc[i].date).getTime(), distance: cum / LOC_TO_METERS });
  }
  if (!locDist.length) return cd.map(c => ({ ...c, distance: 0 }));
  return cd.map(c => {
    const t = new Date(c.date).getTime();
    // Binary search for nearest timestamp
    let lo = 0, hi = locDist.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (locDist[mid].t < t) lo = mid + 1; else hi = mid;
    }
    // Check lo and lo-1 for closest match
    let best = lo;
    if (lo > 0 && Math.abs(locDist[lo - 1].t - t) < Math.abs(locDist[lo].t - t)) best = lo - 1;
    return { ...c, distance: locDist[best].distance };
  });
}

// ============================================================================
// CHART INFRASTRUCTURE
// ============================================================================

// Font aliases
const F = "'Inter','SF Pro Display',system-ui,sans-serif";
const M = "'JetBrains Mono','SF Mono','Cascadia Code','Consolas',monospace";

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

// --- HiDPI helpers ---

function initCanvas(cv, wrap, cssH) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  cv.width = cssW * dpr;
  cv.height = cssH * dpr;
  cv.style.width = cssW + "px";
  cv.style.height = cssH + "px";
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, W: cssW, H: cssH, dpr };
}

function getCtx(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.width / dpr;
  const H = cv.height / dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}

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
  // rows: array of { cols: string[], highlight?: {[colIndex]: color} }
  // colors: array of color strings per row (without #)
  const pad = 10;
  const lineH = 19;
  const headerH = 16;
  const topStrip = 3;

  ctx.save();
  ctx.font = "10px " + M;

  // Measure columns
  const numCols = rows.length > 0 ? rows[0].cols.length : 0;
  const colWidths = [];
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

// --- Chart component ---

function Chart({ traces, syncRef }) {
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
    const panels = [];
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
          // DRS: colored bars per trace
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
          // Brake: solid color bars
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
        const pts = [];
        for (let i = 0; i < n; i++) {
          const x = xPos(data[i].distance ?? 0);
          const v = p.get(data[i]);
          const y = p.y0 + p.h - (v / p.computedMax) * (p.h - 6) - 2;
          pts.push({ x, y });
        }

        // (a) Gradient area fill for single trace
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
  }, [traces]);

  // Hover overlay drawing function
  const drawOverlay = useCallback((hoverDist) => {
    const ol = olRef.current;
    if (!ol) return;
    const { ctx, W, H } = getCtx(ol);
    const { maxDist, panels, L, plotW, plotH } = scalesRef.current;
    if (!plotW || !panels.length) return;
    if (hoverDist < 0 || hoverDist > maxDist) return;

    const xLine = L + (hoverDist / maxDist) * plotW;

    // Crosshair: simple vertical line
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
        // Outer ring
        drawDot(ctx, px, y, p.color);
        if (panel.key === "speed") midY = y;
      });
    });

    // Tooltip: tabular with columns [label, SPD, THR, GEAR, BRK, RPM]
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
      drawTooltip(ctx, xLine, midY, W, header, rows, ["", ...points.map(p => p.color)]);
    }
  }, [traces]);

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

      // Sync delta chart if exists
      if (syncRef && syncRef.current.delta) {
        syncRef.current.delta(hoverDist);
      }
    };

    const onLeave = () => {
      getCtx(ol);
      // Clear delta chart overlay too
      if (syncRef && syncRef.current.delta && olRef.current) {
        // Find delta overlay canvas - just call delta with -1 to clear
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
      <canvas ref={bgRef} style={{ display: "block", borderRadius: "8px 8px 0 0" }} />
      <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: "8px 8px 0 0" }} />
    </div>
  );
}

// --- Delta computation ---

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

// --- DeltaChart component ---

function DeltaChart({ traces, syncRef }) {
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

    // Alternating panel bg (single panel for gap)
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

    // Y-axis ticks - auto-scaled
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
      // Dotted gridline
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
      const pts = [];
      for (let i = 0; i < grid.length; i++) {
        const x = L + (grid[i] / maxDist) * plotW;
        const y = T + (d.values[i] / deltaCeil) * plotH;
        pts.push({ x, y });
      }

      // Gradient area fill
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
    const { ctx, W, H } = getCtx(ol);
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
      // Find who is leader (value closest to 0)
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

      // Sync main chart if exists
      if (syncRef && syncRef.current.chart) {
        syncRef.current.chart(hoverDist);
      }
    };

    const onLeave = () => {
      getCtx(ol);
      // Clear main chart overlay too
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
      <canvas ref={bgRef} style={{ display: "block", borderRadius: "0 0 8px 8px" }} />
      <canvas ref={olRef} style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", borderRadius: "0 0 8px 8px" }} />
    </div>
  );
}

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
  const [showAnalysis, setShowAnalysis] = useState(() => initParams.current.view === "analysis");
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
    setShowAnalysis(p.view === "analysis");
    setTab(p.tab || "laps");
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
    if (showAnalysis) params.view = "analysis";
    if (tab && tab !== "laps") params.tab = tab;
    if (isInitialLoad.current) {
      replaceState(params);
    } else {
      // pushState is a no-op during popstate handling (guarded in hook)
      pushState(params);
    }
  }, [year, mk, sk, dn, showAnalysis, tab, replaceState, pushState]);

  // Mark initial load as done once loading finishes for the first time
  useEffect(() => {
    if (isInitialLoad.current && !loading) {
      isInitialLoad.current = false;
    }
  }, [loading]);

  const onMeeting = useCallback((v) => {
    loadMeeting(v);
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

  /* --- helper: flag badge color --- */
  const flagColor = (flag) => {
    if (!flag) return "rgba(60,60,80,0.6)";
    if (flag === "GREEN") return "#166534";
    if (flag.includes("YELLOW")) return "#854d0e";
    if (flag === "RED") return "#991b1b";
    if (flag === "BLUE") return "#1e40af";
    if (flag === "BLACK AND WHITE") return "#444";
    return "#444";
  };

  /* --- helper: flag left border color --- */
  const flagBorderColor = (flag, category) => {
    if (!flag && !category) return "rgba(255,255,255,0.04)";
    if (flag === "GREEN") return "#22c55e";
    if (flag === "YELLOW" || flag === "DOUBLE YELLOW") return "#eab308";
    if (flag === "RED") return "#ef4444";
    if (flag === "BLUE") return "#3b82f6";
    if (category === "SafetyCar") return "#f97316";
    return "rgba(255,255,255,0.06)";
  };

  return (
    <div style={sty.bg}>
      {/* Background ambient glow */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "100vh", zIndex: 0, pointerEvents: "none" as const,
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(225,6,0,0.06) 0%, transparent 60%)",
      }} />

      {/* ====== HEADER BAR ====== */}
      <div style={{
        position: "sticky" as const, top: 0, zIndex: 100,
      }}>
        {/* Racing stripe accent line */}
        <div style={{
          height: 2,
          background: "linear-gradient(90deg, transparent, #e10600 20%, #e10600 80%, transparent)",
          boxShadow: "0 0 12px rgba(225,6,0,0.4), 0 0 30px rgba(225,6,0,0.15)",
        }} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 28px",
          background: "rgba(5,5,8,0.9)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#e8e8ec", letterSpacing: "-0.5px", fontFamily: F }}>Open</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#e10600", letterSpacing: "-0.5px", fontFamily: F, textShadow: "0 0 24px rgba(225,6,0,0.4)" }}>F1</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#e8e8ec", letterSpacing: "-0.5px", fontFamily: F }}>ow</span>
            </div>
            {mk && meetings.length > 0 && (
              <div className="fade-in hide-mobile" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "5px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#b0b0c0", fontFamily: F }}>
                  {meetings.find(m => String(m.meeting_key) === mk)?.location || ""}
                </span>
                {sk && sessions.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#e10600", fontFamily: M }}>
                    {sessions.find(s => String(s.session_key) === sk)?.session_name || ""}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e10600", animation: "livePulse 2s ease-in-out infinite" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "1.5px", fontFamily: M, textTransform: "uppercase" as const }}>LIVE</span>
            </div>
            <div style={{
              fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: "1.2px",
              textTransform: "uppercase" as const, padding: "5px 12px",
              border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, fontFamily: M,
              background: "rgba(255,255,255,0.02)",
            }}>OpenF1 API</div>
          </div>
        </div>
      </div>

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
        <div className="fade-in-up card-glow" style={{
          ...sty.card,
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
          padding: 0,
          overflow: "hidden",
          borderTop: "1px solid rgba(225,6,0,0.08)",
        }}>
          {/* Year */}
          <div style={{ flex: 0.4, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{
              fontSize: 9, fontWeight: 600, color: "#5a5a6e",
              textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
            }}>SEASON</div>
            <select
              style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }}
              value={year}
              onChange={e => onYear(Number(e.target.value))}
            >
              {[2026, 2025, 2024, 2023].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {/* Race */}
          <div style={{ flex: 1, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{
              fontSize: 9, fontWeight: 600, color: "#5a5a6e",
              textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
            }}>RACE</div>
            <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={mk} onChange={e => onMeeting(e.target.value)}>
              <option value="">Select Race ({meetings.length})</option>
              {meetings.map(m => <option key={m.meeting_key} value={m.meeting_key}>{m.country_name} {"\u2014"} {m.meeting_name}</option>)}
            </select>
          </div>
          {/* Session */}
          {sessions.length > 0 && (
            <div className="fade-in" style={{ flex: 0.6, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{
                fontSize: 9, fontWeight: 600, color: "#5a5a6e",
                textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
              }}>SESSION</div>
              <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={sk} onChange={e => onSession(e.target.value)}>
                <option value="">Select Session</option>
                {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_name}</option>)}
              </select>
            </div>
          )}
          {/* Driver */}
          {drivers.length > 0 && (
            <div className="fade-in" style={{ flex: 1, padding: "14px 18px" }}>
              <div style={{
                fontSize: 9, fontWeight: 600, color: "#5a5a6e",
                textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
              }}>DRIVER</div>
              <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={dn} onChange={e => onDriver(e.target.value)}>
                <option value="">Select Driver ({drivers.length})</option>
                {drivers.map(d => <option key={d.driver_number} value={d.driver_number}>#{d.driver_number} {d.full_name} {"\u2014"} {d.team_name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ====== VIEW TOGGLE (Driver vs Analysis) ====== */}
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
              { label: "Driver View", active: !showAnalysis, onClick: () => setShowAnalysis(false) },
              { label: "Race Analysis", active: showAnalysis, onClick: () => setShowAnalysis(true) },
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
            <RaceAnalysis sessionKey={sk} drivers={drivers} weather={weather} raceControl={rc} results={results} />
          </div>
        </div>

        {/* ====== DRIVER VIEW ====== */}
        {!showAnalysis && drv && !loading && (
          <>
            {/* ====== DRIVER INFO CARD ====== */}
            <div className="fade-in-up" style={{
              ...sty.card,
              borderTop: "3px solid #" + drv.team_colour,
              background: `linear-gradient(135deg, rgba(18,18,30,0.85) 0%, rgba(18,18,30,0.7) 100%)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                {/* Left: headshot + name */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {drv.headshot_url && (
                    <img src={drv.headshot_url} alt="" style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      border: "3px solid #" + drv.team_colour,
                      boxShadow: `0 0 20px ${"#" + drv.team_colour}33, 0 0 40px rgba(0,0,0,0.4)`,
                    }} />
                  )}
                  <div>
                    <div style={{
                      fontSize: 22,
                      fontWeight: 700,
                      fontFamily: F,
                      lineHeight: 1.2,
                    }}>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 500, marginRight: 6, fontSize: 16 }}>#{drv.driver_number}</span>
                      {drv.full_name}
                    </div>
                    <div style={{
                      color: "#" + drv.team_colour,
                      fontSize: 11,
                      fontWeight: 600,
                      marginTop: 4,
                      letterSpacing: "1px",
                      textTransform: "uppercase" as const,
                    }}>{drv.team_name}</div>
                  </div>
                </div>

                {/* Right: stats row */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 0 }}>
                  {best && (
                    <div style={{
                      textAlign: "center",
                      padding: "0 24px",
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "#5a5a6e",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.5px",
                        marginBottom: 4,
                      }}>BEST LAP</div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#a855f7",
                        fontFamily: "'JetBrains Mono','SF Mono',monospace",
                      }}>{ft(best.lap_duration)}</div>
                      <div style={{
                        fontSize: 10,
                        color: "#5a5a6e",
                        marginTop: 2,
                      }}>Lap {best.lap_number}</div>
                    </div>
                  )}
                  <div style={{
                    textAlign: "center",
                    padding: "0 24px",
                    borderRight: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#5a5a6e",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}>LAPS</div>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}>{laps.length}</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "0 24px" }}>
                    <div style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#5a5a6e",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}>PITS</div>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}>{pits.length}</div>
                  </div>
                </div>
              </div>
            </div>

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
              <div style={sty.card}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}>
                  <span style={{
                    ...sty.sectionHead,
                  }}>Lap Times & Sectors</span>
                  <span style={{
                    fontSize: 10,
                    color: "#5a5a6e",
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}>{laps.length} laps</span>
                </div>
                <div style={{ overflow: "auto", maxHeight: 500 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>{["Lap", "Time", "S1", "S2", "S3", "I1", "I2", "ST", "Pit", ""].map((h, i) => (
                        <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : i >= 8 ? "center" : "right" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {laps.map((l, li) => {
                        const ib = best && l.lap_duration === best.lap_duration;
                        const isCmp = comparisons.some(c => c.id === dn + "-" + l.lap_number);
                        return (
                          <tr key={l.lap_number} style={{
                            background: ib
                              ? "transparent"
                              : li % 2 === 0
                                ? "transparent"
                                : "rgba(255,255,255,0.015)",
                          }}>
                            <td style={{
                              ...sty.td,
                              fontWeight: 600,
                              borderLeft: ib ? "4px solid #e10600" : "4px solid transparent",
                              paddingLeft: ib ? 6 : 10,
                            }}>{l.lap_number}</td>
                            <td style={{
                              ...sty.td,
                              ...sty.mono,
                              textAlign: "right",
                              fontWeight: 700,
                              color: ib ? "#a855f7" : "#e8e8ec",
                            }}>{ft(l.lap_duration)}</td>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_1)}</td>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_2)}</td>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_3)}</td>
                            <td style={{ ...sty.td, textAlign: "right", color: "#7dd3fc", fontSize: 11 }}>{l.i1_speed || "\u2014"}</td>
                            <td style={{ ...sty.td, textAlign: "right", color: "#7dd3fc", fontSize: 11 }}>{l.i2_speed || "\u2014"}</td>
                            <td style={{ ...sty.td, textAlign: "right", color: "#fbbf24", fontSize: 11 }}>{l.st_speed || "\u2014"}</td>
                            <td style={{ ...sty.td, textAlign: "center" }}>
                              {l.is_pit_out_lap ? (
                                <span style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: "#f97316",
                                }} />
                              ) : ""}
                            </td>
                            <td style={{ ...sty.td, textAlign: "center" }}>
                              {l.date_start && l.lap_duration ? (
                                <span style={{ display: "inline-flex", gap: 4 }}>
                                  <button onClick={() => loadTel(l)} style={{
                                    background: selLap === l.lap_number ? "#e10600" : "transparent",
                                    color: selLap === l.lap_number ? "#fff" : "#6a6a7e",
                                    border: selLap === l.lap_number ? "1px solid #e10600" : "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: 6,
                                    padding: "4px 10px",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    transition: "all 0.2s ease",
                                    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                                  }}>
                                    {selLap === l.lap_number ? "\u2713" : "Load"}
                                  </button>
                                  <button
                                    onClick={() => addComparison(dn, l, drv)}
                                    disabled={isCmp}
                                    style={{
                                      background: isCmp ? "rgba(225,6,0,0.15)" : "transparent",
                                      color: isCmp ? "#e10600" : "#5a5a6e",
                                      border: isCmp ? "1px solid rgba(225,6,0,0.3)" : "1px solid rgba(255,255,255,0.08)",
                                      borderRadius: 6,
                                      padding: "4px 8px",
                                      cursor: "pointer",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      transition: "all 0.2s ease",
                                      fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                                    }}
                                  >
                                    {isCmp ? "\u2713" : "+"}
                                  </button>
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ====== TELEMETRY TAB ====== */}
            {tab === "telemetry" && (
              <div style={sty.card}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}>
                  <span style={{
                    ...sty.sectionHead,
                  }}>{carData.length ? "Lap " + selLap + " Telemetry" : "Car Telemetry"}</span>
                  {carData.length > 0 && (
                    <span style={{
                      fontSize: 10,
                      color: "#5a5a6e",
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}>{carData.length} samples</span>
                  )}
                </div>
                {!carData.length ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#5a5a6e" }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>Go to <b style={{ color: "#e8e8ec" }}>Laps & Sectors</b> and click <b style={{ color: "#e8e8ec" }}>Load</b> on any lap.</p>
                    <p style={{ fontSize: 11, marginTop: 8, color: "#444" }}>Shows speed, throttle, brake, gear, RPM, DRS at ~3.7Hz</p>
                  </div>
                ) : (
                  <>
                    <Chart traces={[{ data: carData, color: drv.team_colour || "3b82f6", label: "#" + dn + " Lap " + selLap }]} />
                    <div style={{ overflow: "auto", maxHeight: 400, marginTop: 10 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr>{["Dist", "Time", "Speed", "Throttle", "Brake", "Gear", "RPM", "DRS"].map((h, i) => (
                            <th key={i} style={{ ...sty.th, textAlign: [1].includes(i) ? "left" : [4, 7].includes(i) ? "center" : "right" }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {carData.map((c, i) => (
                            <tr key={i} style={{
                              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                            }}>
                              <td style={{
                                ...sty.td,
                                ...sty.mono,
                                textAlign: "right",
                                color: "#5a5a6e",
                                fontSize: 10,
                              }}>{Math.round(c.distance || 0).toLocaleString()}</td>
                              <td style={{
                                ...sty.td,
                                fontSize: 10,
                                color: "#444",
                                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                              }}>{(c.date || "").split("T")[1]?.substring(0, 12)}</td>
                              <td style={{
                                ...sty.td,
                                ...sty.mono,
                                textAlign: "right",
                                fontWeight: 700,
                                color: "#fff",
                              }}>{c.speed}</td>
                              <td style={{ ...sty.td, textAlign: "right" }}>
                                <span style={{ ...sty.mono, fontSize: 11, color: "#b0b0c0" }}>{c.throttle}%</span>
                                <div style={{
                                  height: 5,
                                  background: "rgba(255,255,255,0.06)",
                                  borderRadius: 3,
                                  marginTop: 2,
                                  overflow: "hidden",
                                }}>
                                  <div style={{
                                    height: 5,
                                    background: "#" + (drv.team_colour || "22c55e"),
                                    borderRadius: 3,
                                    width: c.throttle + "%",
                                    transition: "width 0.1s ease",
                                  }} />
                                </div>
                              </td>
                              <td style={{ ...sty.td, textAlign: "center" }}>
                                {c.brake ? (
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#ef4444",
                                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                                    letterSpacing: "0.5px",
                                  }}>BRK</span>
                                ) : (
                                  <span style={{ color: "#2a2a3a" }}>{"\u2014"}</span>
                                )}
                              </td>
                              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{c.n_gear}</td>
                              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e", fontSize: 11 }}>{c.rpm}</td>
                              <td style={{ ...sty.td, textAlign: "center" }}>
                                {DRS_OPEN.includes(c.drs) ? (
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#22c55e",
                                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                                  }}>OPEN</span>
                                ) : c.drs === DRS_ELIGIBLE ? (
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: "#eab308",
                                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                                  }}>ELIG</span>
                                ) : (
                                  <span style={{ color: "#2a2a3a" }}>{"\u2014"}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ====== STINTS TAB ====== */}
            {tab === "stints" && (
              <>
                <div style={sty.card}>
                  <div style={{
                    ...sty.sectionHead,
                    marginBottom: 16,
                  }}>Tyre Stints</div>
                  {/* Horizontal timeline */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "8px 0" }}>
                    {stints.map((s, si) => (
                      <div key={s.stint_number} style={{ display: "flex", alignItems: "center" }}>
                        {/* Stint node */}
                        <div style={{
                          background: "rgba(20,20,36,0.9)",
                          borderRadius: 10,
                          padding: "12px 18px",
                          minWidth: 120,
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderTop: "3px solid " + (TC[s.compound] || "#666"),
                          position: "relative",
                          textAlign: "center",
                        }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: TC[s.compound] || "#e8e8ec",
                            fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                            marginBottom: 4,
                          }}>{s.compound}</div>
                          <div style={{
                            fontSize: 11,
                            color: "#b0b0c0",
                            fontFamily: "'JetBrains Mono','SF Mono',monospace",
                          }}>L{s.lap_start}{"\u2013"}{s.lap_end}</div>
                          <div style={{
                            fontSize: 10,
                            color: "#5a5a6e",
                            marginTop: 2,
                          }}>{s.lap_end - s.lap_start + 1} laps / Age {s.tyre_age_at_start}</div>
                        </div>
                        {/* Connector line */}
                        {si < stints.length - 1 && (
                          <div style={{
                            width: 32,
                            height: 2,
                            background: "rgba(255,255,255,0.08)",
                            flexShrink: 0,
                          }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={sty.card}>
                  <div style={{
                    ...sty.sectionHead,
                    marginBottom: 14,
                  }}>Pit Stops</div>
                  {!pits.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No pit stops</div> : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr>{["Lap", "Lane", "Stop", "Time"].map((h, i) => <th key={i} style={{ ...sty.th, textAlign: i > 0 && i < 3 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {pits.map((p, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                            <td style={{ ...sty.td, fontWeight: 600 }}>{p.lap_number}</td>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{p.lane_duration?.toFixed(3)}s</td>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700, color: "#fbbf24" }}>{p.stop_duration ? p.stop_duration + "s" : "\u2014"}</td>
                            <td style={{ ...sty.td, fontSize: 10, color: "#5a5a6e", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{(p.date || "").split("T")[1]?.substring(0, 8)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ====== POSITION TAB ====== */}
            {tab === "position" && (
              <div style={sty.card}>
                <div style={{
                  ...sty.sectionHead,
                  marginBottom: 14,
                }}>Position Changes</div>
                {!positions.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No data</div> : (
                  <div style={{ overflow: "auto", maxHeight: 500 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr><th style={sty.th}>Time</th><th style={{ ...sty.th, textAlign: "center" }}>Position</th></tr></thead>
                      <tbody>
                        {positions.map((p, i) => {
                          const prev = i > 0 ? positions[i - 1].position : p.position;
                          const df = prev - p.position;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                              <td style={{
                                ...sty.td,
                                fontSize: 11,
                                color: "#5a5a6e",
                                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                              }}>{(p.date || "").split("T")[1]?.substring(0, 8)}</td>
                              <td style={{ ...sty.td, textAlign: "center" }}>
                                <span style={{ fontWeight: 700, fontSize: 16 }}>P{p.position}</span>
                                {df !== 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: df > 0 ? "#22c55e" : "#ef4444" }}>{df > 0 ? "\u25B2" + df : "\u25BC" + Math.abs(df)}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ====== WEATHER TAB ====== */}
            {tab === "weather" && (
              <div style={sty.card}>
                <div style={{
                  ...sty.sectionHead,
                  marginBottom: 14,
                }}>Weather</div>
                {!weather.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No data</div> : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 8,
                    maxHeight: 500,
                    overflowY: "auto",
                  }}>
                    {weather.slice(-30).map((w, i) => (
                      <div key={i} style={{
                        background: "rgba(20,20,36,0.6)",
                        borderRadius: 10,
                        padding: "12px 14px",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}>
                          <span style={{
                            fontSize: 10,
                            color: "#5a5a6e",
                            fontFamily: "'JetBrains Mono','SF Mono',monospace",
                          }}>{(w.date || "").split("T")[1]?.substring(0, 8)}</span>
                          <span style={{ fontSize: 16 }}>{w.rainfall ? "\u2601" : "\u2600"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "#5a5a6e" }}>Air</span>
                          <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.air_temperature}{"\u00B0"}C</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "#5a5a6e" }}>Track</span>
                          <span style={{ fontWeight: 600, color: "#fbbf24", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.track_temperature}{"\u00B0"}C</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "#5a5a6e" }}>Humidity</span>
                          <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.humidity}%</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "#5a5a6e" }}>Wind</span>
                          <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.wind_speed} m/s {w.wind_direction != null ? "@ " + w.wind_direction + "\u00B0" : ""}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: "#5a5a6e" }}>Pressure</span>
                          <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.pressure} mbar</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ====== RACE CONTROL TAB ====== */}
            {tab === "rc" && (
              <div style={sty.card}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}>
                  <span style={{
                    ...sty.sectionHead,
                  }}>Race Control</span>
                  <span style={{
                    fontSize: 10,
                    color: "#5a5a6e",
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}>{rc.length} messages</span>
                </div>
                {!rc.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No messages</div> : (
                  <div style={{ maxHeight: 500, overflowY: "auto" }}>
                    {rc.map((r, i) => (
                      <div key={i} style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        borderLeft: "3px solid " + flagBorderColor(r.flag, r.category),
                        marginBottom: 2,
                        borderRadius: "0 6px 6px 0",
                        background: "rgba(255,255,255,0.01)",
                        transition: "background 0.15s ease",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10,
                            color: "#5a5a6e",
                            fontFamily: "'JetBrains Mono','SF Mono',monospace",
                          }}>{(r.date || "").split("T")[1]?.substring(0, 8)}</span>
                          {r.flag && (
                            <span style={{
                              fontSize: 9,
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontWeight: 700,
                              color: "#fff",
                              background: flagColor(r.flag),
                              letterSpacing: "0.3px",
                              textTransform: "uppercase" as const,
                            }}>{r.flag}</span>
                          )}
                          <span style={{
                            fontSize: 9,
                            color: "#5a5a6e",
                            background: "rgba(255,255,255,0.04)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontWeight: 500,
                          }}>{r.category}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#b0b0c0", lineHeight: 1.4 }}>{r.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ====== RESULTS TAB ====== */}
            {tab === "results" && (
              <div style={sty.card}>
                <div style={{
                  ...sty.sectionHead,
                  marginBottom: 14,
                }}>Results</div>
                {!results.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No results yet</div> : (
                  <div style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr>{["Pos", "Driver", "Time", "Gap", "Laps", "Status"].map((h, i) => (
                        <th key={i} style={{ ...sty.th, textAlign: [0, 5].includes(i) ? "center" : i >= 2 && i <= 4 ? "right" : "left" }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {[...results].sort((a, b) => a.position - b.position).map((r, ri) => {
                          const dv = drivers.find(d => d.driver_number === r.driver_number);
                          const posColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                          return (
                            <tr key={r.driver_number} style={{
                              background: String(r.driver_number) === String(dn)
                                ? "rgba(225,6,0,0.08)"
                                : ri % 2 === 0
                                  ? "transparent"
                                  : "rgba(255,255,255,0.015)",
                            }}>
                              <td style={{
                                ...sty.td,
                                textAlign: "center",
                                fontWeight: 800,
                                fontSize: r.position <= 3 ? 18 : 14,
                                color: r.position <= 3 ? posColors[r.position - 1] : "#e8e8ec",
                                fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                              }}>{r.position}</td>
                              <td style={{
                                ...sty.td,
                                borderLeft: "3px solid #" + (dv ? dv.team_colour : "333"),
                                paddingLeft: 12,
                              }}>
                                <span style={{
                                  color: "#" + (dv ? dv.team_colour : "e8e8ec"),
                                  fontWeight: 600,
                                  marginRight: 6,
                                  fontSize: 11,
                                }}>#{r.driver_number}</span>
                                <span style={{ fontWeight: 500 }}>{dv ? dv.full_name : "Driver " + r.driver_number}</span>
                              </td>
                              <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0", fontSize: 11 }}>
                                {Array.isArray(r.duration) ? r.duration.map(x => x ? ft(x) : "\u2014").join(" / ") : ft(r.duration)}
                              </td>
                              <td style={{
                                ...sty.td,
                                ...sty.mono,
                                textAlign: "right",
                                color: r.gap_to_leader === 0 ? "#5a5a6e" : "#ef4444",
                                fontSize: 11,
                              }}>
                                {r.gap_to_leader === 0 ? "\u2014" : typeof r.gap_to_leader === "string" ? r.gap_to_leader : "+" + r.gap_to_leader + "s"}
                              </td>
                              <td style={{ ...sty.td, textAlign: "right", color: "#b0b0c0" }}>{r.number_of_laps || ""}</td>
                              <td style={{ ...sty.td, textAlign: "center" }}>
                                {r.dnf ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "0.5px" }}>DNF</span>
                                ) : r.dns ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316", letterSpacing: "0.5px" }}>DNS</span>
                                ) : r.dsq ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "0.5px" }}>DSQ</span>
                                ) : (
                                  <span style={{ fontSize: 10, color: "#22c55e" }}>{"\u2713"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ====== FOOTER ====== */}
      <div style={{ position: "relative", marginTop: 60 }}>
        {/* Racing stripe */}
        <div style={{
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(225,6,0,0.2) 30%, rgba(225,6,0,0.2) 70%, transparent)",
        }} />
        <div style={{
          padding: "24px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: F }}>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>Open</span>
              <span style={{ color: "rgba(225,6,0,0.35)" }}>F1</span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>ow</span>
            </span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.08)", fontFamily: M }}>2026</span>
          </div>
          <div style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.1)",
            fontFamily: M,
            display: "flex",
            alignItems: "center",
            gap: 12,
            letterSpacing: "0.5px",
          }}>
            <span>Powered by OpenF1 API</span>
            <span style={{ color: "rgba(225,6,0,0.15)" }}>{"\u2022"}</span>
            <span>Not affiliated with Formula 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
