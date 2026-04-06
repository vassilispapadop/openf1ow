import { useEffect, useRef, useMemo } from "react";
import type { Driver, Lap, Weather } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { initCanvas, drawWatermark } from "../../lib/canvas";
import { ft3, ft1, ftn, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import useTooltip from "./useTooltip";
import ShareButton from "../ShareButton";

const LEFT_MARGIN = 56;
const RIGHT_PAD = 16;
const X_AXIS_H = 32;

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
    drawWatermark(ctx, W, H);
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
            <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
              <ShareButton canvasRef={cvRef} filename="openf1ow-weather" />
            </div>
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
                          {hotCool !== null ? (hotCool > 0 ? "+" : "") + hotCool.toFixed(3) + "s" : "\u2014"}
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

export default WeatherCorrelation;
