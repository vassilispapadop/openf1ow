import { useEffect, useMemo, useState } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M } from "../../lib/styles";
import { drawWatermark, getCtx } from "../../lib/canvas";
import { useResponsiveCanvas, adaptiveMargins } from "../../lib/useResponsiveCanvas";
import { DRIVER_COLORS } from "../../lib/constants";

const TOP_PAD = 12;
const X_AXIS_H = 32;
const CSS_H = 380;

function GapChart({ allLaps, drivers, focusDriver }: {
  allLaps: Lap[];
  drivers: Driver[];
  focusDriver?: string;
}) {
  const { wrapRef, canvasRef: cvRef, width } = useResponsiveCanvas(CSS_H);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const toggle = (num: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  // Compute gap-to-leader per lap for each driver
  const { driverGaps, maxLap, maxGap } = useMemo(() => {
    // Group laps by driver
    const byDriver: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!byDriver[l.driver_number]) byDriver[l.driver_number] = [];
      byDriver[l.driver_number].push(l);
    });

    // Build cumulative time per driver per lap
    const cumulative: Record<number, Record<number, number>> = {};
    let totalLaps = 0;

    for (const [dnStr, laps] of Object.entries(byDriver)) {
      const dn = Number(dnStr);
      const sorted = [...laps].sort((a, b) => a.lap_number - b.lap_number);
      cumulative[dn] = {};
      let cum = 0;
      for (const l of sorted) {
        if (l.lap_duration && l.lap_duration > 0) {
          cum += l.lap_duration;
          cumulative[dn][l.lap_number] = cum;
        }
        totalLaps = Math.max(totalLaps, l.lap_number);
      }
    }

    // For each lap, find the leader (smallest cumulative time)
    const leaderTime: Record<number, number> = {};
    for (let lap = 1; lap <= totalLaps; lap++) {
      let best = Infinity;
      for (const dn of Object.keys(cumulative)) {
        const t = cumulative[Number(dn)][lap];
        if (t != null && t < best) best = t;
      }
      if (best < Infinity) leaderTime[lap] = best;
    }

    // Compute gaps
    const gaps: { driver: Driver; points: { lap: number; gap: number }[] }[] = [];
    let gapMax = 0;

    for (const d of drivers) {
      const cum = cumulative[d.driver_number];
      if (!cum) continue;
      const pts: { lap: number; gap: number }[] = [];
      for (let lap = 1; lap <= totalLaps; lap++) {
        if (cum[lap] != null && leaderTime[lap] != null) {
          const gap = cum[lap] - leaderTime[lap];
          pts.push({ lap, gap });
          gapMax = Math.max(gapMax, gap);
        }
      }
      if (pts.length > 0) gaps.push({ driver: d, points: pts });
    }

    return { driverGaps: gaps, maxLap: totalLaps, maxGap: gapMax || 10 };
  }, [allLaps, drivers]);

  // Draw
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || width === 0 || driverGaps.length === 0) return;
    const { ctx, W, H } = getCtx(cv);
    const m = adaptiveMargins(width);
    const LEFT_MARGIN = m.left;
    const RIGHT_PAD = m.right;
    const plotW = W - LEFT_MARGIN - RIGHT_PAD;
    const plotH = H - TOP_PAD - X_AXIS_H;

    const xScale = (lap: number) => LEFT_MARGIN + (lap / maxLap) * plotW;
    const yScale = (gap: number) => TOP_PAD + (gap / maxGap) * plotH;

    // Background
    ctx.fillStyle = "rgba(12,12,24,0.95)";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = TOP_PAD + (i / yTicks) * plotH;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, y);
      ctx.lineTo(W - RIGHT_PAD, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#4a4a62";
      ctx.font = `10px ${M}`;
      ctx.textAlign = "right";
      const val = (i / yTicks) * maxGap;
      ctx.fillText(val < 60 ? val.toFixed(1) + "s" : Math.floor(val / 60) + "m" + (val % 60).toFixed(0) + "s", LEFT_MARGIN - 8, y + 3);
    }

    // X axis labels
    const xStep = Math.max(1, Math.ceil(maxLap / 10));
    ctx.fillStyle = "#4a4a62";
    ctx.font = `10px ${M}`;
    ctx.textAlign = "center";
    for (let lap = 0; lap <= maxLap; lap += xStep) {
      const x = xScale(lap);
      ctx.fillText(`L${lap}`, x, H - X_AXIS_H + 20);
    }

    // Y axis label
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#4a4a62";
    ctx.font = `bold 10px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText("Gap to Leader", 0, 0);
    ctx.restore();

    // Lines
    for (let i = 0; i < driverGaps.length; i++) {
      const { driver, points } = driverGaps[i];
      if (hidden.has(driver.driver_number)) continue;

      const isFocused = focusDriver && driver.name_acronym === focusDriver;
      const color = "#" + (driver.team_colour || DRIVER_COLORS[i % DRIVER_COLORS.length]);

      ctx.strokeStyle = color;
      ctx.lineWidth = isFocused ? 2.5 : 1.2;
      ctx.globalAlpha = focusDriver ? (isFocused ? 1 : 0.15) : 0.8;
      ctx.beginPath();
      for (let j = 0; j < points.length; j++) {
        const x = xScale(points[j].lap);
        const y = yScale(points[j].gap);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawWatermark(ctx, W, H);
  }, [driverGaps, maxLap, maxGap, hidden, focusDriver, width]);

  return (
    <div>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <canvas ref={cvRef} style={{ width: "100%", display: "block" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {driverGaps.map(({ driver }, i) => {
          const color = "#" + (driver.team_colour || DRIVER_COLORS[i % DRIVER_COLORS.length]);
          const off = hidden.has(driver.driver_number);
          return (
            <button key={driver.driver_number} onClick={() => toggle(driver.driver_number)} style={{
              background: off ? "transparent" : color + "18",
              border: `1px solid ${off ? "rgba(255,255,255,0.06)" : color + "44"}`,
              color: off ? "#4a4a62" : color,
              borderRadius: 6, padding: "3px 8px", cursor: "pointer",
              fontSize: 10, fontWeight: 700, fontFamily: F,
            }}>
              {driver.name_acronym}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GapChart;
