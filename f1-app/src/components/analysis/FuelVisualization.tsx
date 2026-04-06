import React, { useEffect, useRef, useMemo, useCallback } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { FUEL_TOTAL_KG, FUEL_SEC_PER_KG } from "../../lib/raceUtils";
import { drawWatermark } from "../../lib/canvas";
import useTooltip from "./useTooltip";
import ShareButton from "../ShareButton";

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

    drawWatermark(ctx, cssW, cssH);
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
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
          <ShareButton canvasRef={cvRef} filename="openf1ow-fuel" />
        </div>
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

export default FuelVisualization;
