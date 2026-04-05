import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { initCanvas } from "../../lib/canvas";
import { ft3, rowBg } from "../../lib/format";
import { median, computeSlowLapThreshold, isCleanLap, FUEL_TOTAL_KG, FUEL_SEC_PER_KG, DIRTY_AIR_THRESHOLD } from "../../lib/raceUtils";
import useTooltip from "./useTooltip";

const RIGHT_PAD = 16;

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

export function useDirtyAirData(allLaps: Lap[], drivers: Driver[], stints: Stint[]) {
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
export function DirtyAirTimeline({ data, totalLaps, drivers }: { data: DirtyAirDriverResult[]; totalLaps: number; drivers: Driver[] }) {
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
                      Laps {t.fromLap}\u2013{t.toLap}
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

export default DirtyAirAnalysis;
