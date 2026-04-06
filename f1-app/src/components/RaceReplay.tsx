import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Driver } from "../lib/types";
import { F, M, sty } from "../lib/styles";
import { api } from "../lib/api";
import { drawWatermark } from "../lib/canvas";
import ShareButton from "./ShareButton";

interface LocPoint { x: number; y: number; ts: number; dn: number }
interface PosEvent { dn: number; pos: number; ts: number }
interface GapEvent { dn: number; gap: number | null; ts: number }
interface LapEvent { dn: number; lap: number; ts: number }

const ESTIMATED_LAP_MS = 100_000; // ~100s — approximate lap duration for DNF cutoff

// Binary search: find last index where arr[i].ts <= target
function bisect(arr: { ts: number }[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].ts <= target) lo = mid + 1; else hi = mid - 1;
  }
  return hi;
}

export default function RaceReplay({ sessionKey, drivers }: { sessionKey: string; drivers: Driver[] }) {
  const [allPoints, setAllPoints] = useState<LocPoint[][]>([]);
  const [trackOutline, setTrackOutline] = useState<{ x: number; y: number }[]>([]);
  // Pre-indexed by driver number for O(log n) lookups
  const [posIndex, setPosIndex] = useState<Record<number, PosEvent[]>>({});
  const [gapIndex, setGapIndex] = useState<Record<number, GapEvent[]>>({});
  const [lapIndex, setLapIndex] = useState<LapEvent[]>([]);
  const [totalRaceLaps, setTotalRaceLaps] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [timeIdx, setTimeIdx] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Reset everything when session changes
  useEffect(() => {
    setAllPoints([]);
    setTrackOutline([]);
    setPosIndex({});
    setGapIndex({});
    setLapIndex([]);
    setTotalRaceLaps(0);
    setPlaying(false);
    setTimeIdx(0);
    setError("");
  }, [sessionKey]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);

  const timeAxis = useMemo(() => {
    if (!allPoints.length) return [];
    const first = allPoints.find(p => p.length > 0);
    return first ? first.map(p => p.ts) : [];
  }, [allPoints]);

  const totalFrames = timeAxis.length;

  const drvMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  // Derived: timestamp after which each DNF driver should be hidden
  const dnfTimes = useMemo(() => {
    if (!lapIndex.length || !totalRaceLaps) return {};
    const lastLapByDriver: Record<number, { lap: number; ts: number }> = {};
    lapIndex.forEach(e => {
      if (!lastLapByDriver[e.dn] || e.lap > lastLapByDriver[e.dn].lap) {
        lastLapByDriver[e.dn] = { lap: e.lap, ts: e.ts };
      }
    });
    const dnf: Record<number, number> = {};
    for (const [dn, { lap, ts }] of Object.entries(lastLapByDriver)) {
      if (lap < totalRaceLaps) {
        dnf[Number(dn)] = ts + ESTIMATED_LAP_MS;
      }
    }
    return dnf;
  }, [lapIndex, totalRaceLaps]);

  // Compute current positions and gaps using binary search (O(log n) per driver)
  const currentState = useMemo(() => {
    if (!timeAxis.length) return { lap: 1, positions: [] as { dn: number; gap: string; pos: number; out: boolean }[] };
    const now = timeAxis[timeIdx] || 0;

    // Current position per driver via binary search
    const entries: { dn: number; pos: number; gap: number | null }[] = [];
    for (const [dnStr, events] of Object.entries(posIndex)) {
      const idx = bisect(events, now);
      if (idx >= 0) {
        const dn = Number(dnStr);
        const gapArr = gapIndex[dn];
        const gapIdx = gapArr ? bisect(gapArr, now) : -1;
        entries.push({
          dn,
          pos: events[idx].pos,
          gap: gapIdx >= 0 ? gapArr[gapIdx].gap : null,
        });
      }
    }
    entries.sort((a, b) => a.pos - b.pos);

    // Current lap via binary search on sorted lap events
    const lapIdx = bisect(lapIndex, now);
    const currentLap = lapIdx >= 0 ? lapIndex[lapIdx].lap : 1;

    // Build positions: active drivers first, then retired at bottom
    const positions: { dn: number; gap: string; pos: number; out: boolean }[] = [];
    const retired: typeof positions = [];
    entries.forEach(e => {
      const isOut = !!(dnfTimes[e.dn] && now > dnfTimes[e.dn]);
      if (isOut) {
        retired.push({ dn: e.dn, gap: "OUT", pos: e.pos, out: true });
      } else {
        let gap = "---";
        if (e.pos === 1) gap = "LEADER";
        else if (e.gap != null && typeof e.gap === "number" && isFinite(e.gap)) gap = "+" + e.gap.toFixed(1);
        positions.push({ dn: e.dn, gap, pos: e.pos, out: false });
      }
    });
    positions.push(...retired);

    return { lap: Math.min(currentLap, totalRaceLaps || currentLap), positions };
  }, [timeIdx, timeAxis, posIndex, gapIndex, lapIndex, totalRaceLaps, dnfTimes]);

  // Fetch data
  const load = useCallback(async () => {
    if (!sessionKey || !drivers.length) return;
    setLoading(true);
    setError("");
    setProgress("Fetching race info...");

    try {
      const sessions = await api("/sessions?session_key=" + sessionKey);
      const raceStart = sessions[0]?.date_start;
      if (!raceStart) throw new Error("No race start time found");

      // Fetch positions, intervals, and laps in parallel
      setProgress("Loading timing data...");
      const [posData, intervalData, lapData] = await Promise.all([
        api("/position?session_key=" + sessionKey).catch(() => []),
        api("/intervals?session_key=" + sessionKey).catch(() => []),
        api("/laps?session_key=" + sessionKey).catch(() => []),
      ]);

      // Build per-driver indexed position events (sorted by time)
      const posIdx: Record<number, PosEvent[]> = {};
      (posData as any[]).forEach(p => {
        const dn = p.driver_number;
        if (!posIdx[dn]) posIdx[dn] = [];
        posIdx[dn].push({ dn, pos: p.position, ts: new Date(p.date).getTime() });
      });
      setPosIndex(posIdx);

      // Build per-driver indexed gap events (sorted by time)
      const gapIdx: Record<number, GapEvent[]> = {};
      (intervalData as any[]).forEach(g => {
        const dn = g.driver_number;
        if (!gapIdx[dn]) gapIdx[dn] = [];
        gapIdx[dn].push({ dn, gap: g.gap_to_leader, ts: new Date(g.date).getTime() });
      });
      setGapIndex(gapIdx);

      // Build sorted lap events (for lap counter)
      const lapEvts: LapEvent[] = [];
      let maxLap = 0;
      (lapData as any[]).forEach(l => {
        if (l.date_start && l.lap_number >= 1) {
          lapEvts.push({ dn: l.driver_number, lap: l.lap_number, ts: new Date(l.date_start).getTime() });
          if (l.lap_number > maxLap) maxLap = l.lap_number;
        }
      });
      lapEvts.sort((a, b) => a.ts - b.ts);
      setLapIndex(lapEvts);
      setTotalRaceLaps(maxLap);

      // Start from lights out (Lap 1 date_start)
      const lap1Starts = lapEvts.filter(c => c.lap === 1).map(c => c.ts);
      const lightsOut = lap1Starts.length ? new Date(Math.min(...lap1Starts)).toISOString() : raceStart;

      // Fetch location data
      const BATCH = 5;
      const driverNums = drivers.map(d => d.driver_number);
      const rawData: { dn: number; points: LocPoint[] }[] = [];

      for (let i = 0; i < driverNums.length; i += BATCH) {
        const batch = driverNums.slice(i, i + BATCH);
        setProgress(`Loading positions (${Math.min(i + BATCH, driverNums.length)}/${driverNums.length} drivers)...`);
        const results = await Promise.all(
          batch.map(dn =>
            api(`/location?session_key=${sessionKey}&driver_number=${dn}&date>=${lightsOut}`)
              .catch(() => [])
          )
        );
        results.forEach((data, idx) => {
          const dn = batch[idx];
          if (!Array.isArray(data) || data.length < 20) return;
          const points: LocPoint[] = [];
          let lastTs = 0;
          for (const p of data) {
            const ts = new Date(p.date).getTime();
            if (ts - lastTs >= 450) {
              points.push({ x: p.x, y: p.y, ts, dn });
              lastTs = ts;
            }
          }
          if (points.length > 10) rawData.push({ dn, points });
        });
      }

      if (!rawData.length) throw new Error("No location data available");

      setProgress("Building track map...");
      const longest = rawData.reduce((a, b) => a.points.length > b.points.length ? a : b);
      const lp = longest.points;

      // Detect one full lap
      const lapStart = lp[0];
      let maxDist = 0;
      let lapEndIdx = Math.min(lp.length, 400);
      for (let i = 1; i < Math.min(lp.length, 2000); i++) {
        const dx = lp[i].x - lapStart.x, dy = lp[i].y - lapStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) maxDist = dist;
        if (maxDist > 2000 && dist < 300) { lapEndIdx = i; break; }
      }
      setTrackOutline(lp.slice(0, lapEndIdx).map(p => ({ x: p.x, y: p.y })));

      // Align all drivers to common time axis
      const refTimes = lp.map(p => p.ts);
      const aligned: LocPoint[][] = rawData.map(({ dn, points }) => {
        const result: LocPoint[] = [];
        let j = 0;
        for (const ts of refTimes) {
          while (j < points.length - 1 && points[j + 1].ts <= ts) j++;
          if (j >= points.length - 1 || points[j].ts > ts) {
            result.push({ x: 0, y: 0, ts, dn: 0 });
            continue;
          }
          const p0 = points[j], p1 = points[j + 1];
          const frac = p1.ts > p0.ts ? (ts - p0.ts) / (p1.ts - p0.ts) : 0;
          result.push({
            x: p0.x + (p1.x - p0.x) * frac,
            y: p0.y + (p1.y - p0.y) * frac,
            ts, dn,
          });
        }
        return result;
      });

      setAllPoints(aligned);
      setTimeIdx(0);
      setProgress("");
    } catch (e: any) {
      setError(e.message || "Failed to load");
      setProgress("");
    }
    setLoading(false);
  }, [sessionKey, drivers]);

  // Memoize track bounds (never changes during playback)
  const trackBounds = useMemo(() => {
    if (!trackOutline.length) return null;
    const xs = trackOutline.map(p => p.x);
    const ys = trackOutline.map(p => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [trackOutline]);

  // Canvas rendering
  const draw = useCallback((idx: number) => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !trackBounds || !allPoints.length) return;
    try {

    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const driverRows = currentState.positions.length;
    const H = Math.max(520, 32 + driverRows * 22 + 10);
    const TOWER_W = 180;
    const MAP_W = W - TOWER_W;
    // Only resize canvas when dimensions change
    const needsResize = cv.width !== W * dpr || cv.height !== H * dpr;
    if (needsResize) {
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

    // Watermark
    drawWatermark(ctx, W, H);

    // === TIMING TOWER (left side) ===
    const towerX = 0;
    ctx.fillStyle = "rgba(8,8,16,0.95)";
    ctx.fillRect(towerX, 0, TOWER_W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TOWER_W, 0); ctx.lineTo(TOWER_W, H); ctx.stroke();

    // Tower header
    ctx.fillStyle = "#e10600";
    ctx.fillRect(towerX, 0, TOWER_W, 28);
    ctx.font = `bold 10px ${F}`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText("RACE", towerX + 10, 18);
    ctx.textAlign = "right";
    ctx.font = `bold 10px ${M}`;
    ctx.fillText(`LAP ${currentState.lap}/${totalRaceLaps}`, TOWER_W - 8, 18);

    // Driver rows
    const ROW_H = 22;
    const startY = 32;
    currentState.positions.forEach((p, i) => {
      const drv = drvMap[p.dn];
      if (!drv) return;
      const y = startY + i * ROW_H;
      if (y + ROW_H > H) return;
      const isOut = p.out;
      const color = "#" + (drv.team_colour || "666");

      // Row background
      ctx.fillStyle = isOut ? "rgba(255,0,0,0.03)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
      ctx.fillRect(towerX, y, TOWER_W, ROW_H);

      // Team color bar
      ctx.globalAlpha = isOut ? 0.3 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(towerX, y, 3, ROW_H);

      // Position number
      ctx.font = `bold 10px ${M}`;
      ctx.fillStyle = isOut ? "#3a3a4e" : i < 3 ? (i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : "#CD7F32") : "#5a5a6e";
      ctx.textAlign = "right";
      ctx.fillText(isOut ? "--" : String(p.pos), towerX + 22, y + 15);

      // Driver acronym
      ctx.font = `bold 10px ${F}`;
      ctx.fillStyle = isOut ? "#3a3a4e" : "#e8e8ec";
      ctx.textAlign = "left";
      ctx.fillText(drv.name_acronym, towerX + 28, y + 15);

      // Gap
      ctx.font = `9px ${M}`;
      const gapStr = p.gap || "---";
      ctx.fillStyle = gapStr === "OUT" ? "#ef4444" : gapStr === "LEADER" ? "#22c55e" : gapStr.includes("LAP") ? "#ef4444" : "#6a6a7e";
      ctx.textAlign = "right";
      ctx.fillText(gapStr, TOWER_W - 6, y + 15);
      ctx.globalAlpha = 1;
    });

    // === TRACK MAP (right side) ===
    const { minX, maxX, minY, maxY } = trackBounds;
    const trackW = maxX - minX || 1, trackH = maxY - minY || 1;
    const PAD = 36;
    const mapL = TOWER_W + PAD;
    const scaleX = (MAP_W - PAD * 2) / trackW;
    const scaleY = (H - PAD * 2) / trackH;
    const scale = Math.min(scaleX, scaleY);
    const offX = mapL + (MAP_W - PAD * 2 - trackW * scale) / 2;
    const offY = PAD + (H - PAD * 2 - trackH * scale) / 2;

    const toScreen = (x: number, y: number): [number, number] => [
      offX + (x - minX) * scale,
      offY + (maxY - y) * scale,
    ];

    // Track outline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 16;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trackOutline.forEach((p, i) => {
      const [sx, sy] = toScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 14;
    ctx.stroke();

    // Driver dots
    const now = timeAxis[idx] || 0;
    if (idx >= 0 && idx < totalFrames) {
      allPoints.forEach(driverPts => {
        if (idx >= driverPts.length) return;
        const pt = driverPts[idx];
        if (!pt || pt.dn === 0) return;
        // Hide retired drivers
        if (dnfTimes[pt.dn] && now > dnfTimes[pt.dn]) return;
        const drv = drvMap[pt.dn];
        if (!drv) return;

        const [sx, sy] = toScreen(pt.x, pt.y);
        if (!isFinite(sx) || !isFinite(sy)) return;
        const color = "#" + (drv.team_colour || "666");

        // Glow
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.fillStyle = color + "20";
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.font = `bold 8px ${F}`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(drv.name_acronym, sx, sy - 9);
      });
    }

    // Elapsed time
    if (timeAxis[idx]) {
      const elapsed = (timeAxis[idx] - timeAxis[0]) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      ctx.font = `bold 11px ${M}`;
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "right";
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, W - 12, 18);
    }

    // Progress bar
    const pct = idx / Math.max(totalFrames - 1, 1);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(TOWER_W, H - 3, MAP_W, 3);
    ctx.fillStyle = "#e10600";
    ctx.fillRect(TOWER_W, H - 3, MAP_W * pct, 3);
    } catch (e) { console.warn("RaceReplay draw error:", e); }
  }, [trackOutline, trackBounds, allPoints, totalFrames, timeAxis, drvMap, currentState, totalRaceLaps, dnfTimes]);

  useEffect(() => { draw(timeIdx); }, [timeIdx, draw]);

  // Animation loop
  useEffect(() => {
    if (!playing || !timeAxis.length) return;
    let lastWall = performance.now();
    const sampleInterval = timeAxis.length > 1 ? (timeAxis[1] - timeAxis[0]) / 1000 : 0.5;
    let accum = 0;
    const tick = (now: number) => {
      const dtWall = (now - lastWall) / 1000;
      lastWall = now;
      accum += dtWall * speed;
      const frames = Math.floor(accum / sampleInterval);
      if (frames > 0) {
        accum -= frames * sampleInterval;
        setTimeIdx(prev => {
          const next = prev + frames;
          if (next >= totalFrames) { setPlaying(false); return totalFrames - 1; }
          return next;
        });
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, totalFrames, timeAxis]);

  if (!allPoints.length && !loading) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{
          width: 56, height: 56, margin: "0 auto 16px",
          background: "linear-gradient(135deg, rgba(225,6,0,0.12), rgba(168,85,247,0.12))",
          borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>&#9654;</div>
        <div style={sty.sectionHead}>Race Replay</div>
        <p style={{ color: "#b0b0c0", fontSize: 13, margin: "12px auto 20px", lineHeight: 1.6, maxWidth: 420 }}>
          Watch the race unfold on the actual track layout with a live timing tower. Requires downloading position data for all drivers.
        </p>
        {error && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button onClick={load} style={{
          background: "linear-gradient(135deg, #e10600, #a855f7)",
          color: "#fff", border: "none", borderRadius: 10,
          padding: "12px 32px", fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: F,
        }}>Load Race Replay</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{
          width: 40, height: 40,
          border: "3px solid rgba(255,255,255,0.04)", borderTopColor: "#e10600",
          borderRadius: "50%", animation: "spin 0.7s linear infinite",
          margin: "0 auto 16px",
        }} />
        <div style={{ fontSize: 12, color: "#b0b0c0", fontFamily: M }}>{progress}</div>
      </div>
    );
  }

  const elapsed = timeAxis[timeIdx] ? (timeAxis[timeIdx] - timeAxis[0]) / 1000 : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <div>
      <div ref={wrapRef} style={{ position: "relative", marginBottom: 14 }}>
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
          <ShareButton canvasRef={canvasRef} filename="openf1ow-race-replay" />
        </div>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 12 }} />
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", background: "rgba(12,12,24,0.6)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        <button onClick={() => {
          if (timeIdx >= totalFrames - 1) setTimeIdx(0);
          setPlaying(!playing);
        }} style={{
          width: 36, height: 36, borderRadius: 8,
          background: playing ? "rgba(225,6,0,0.2)" : "linear-gradient(135deg, #e10600, #b80500)",
          border: "none", cursor: "pointer", color: "#fff",
          fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: playing ? "none" : "0 2px 10px rgba(225,6,0,0.3)",
        }}>{playing ? "||" : "\u25B6"}</button>

        <input type="range" min={0} max={Math.max(totalFrames - 1, 0)} value={timeIdx}
          onChange={e => { setPlaying(false); setTimeIdx(Number(e.target.value)); }}
          style={{ flex: 1, minWidth: 120, accentColor: "#e10600", cursor: "pointer" }} />

        <div style={{ fontFamily: M, fontSize: 12, fontWeight: 600, color: "#b0b0c0", minWidth: 48 }}>
          {mins}:{secs.toString().padStart(2, "0")}
        </div>

        <div style={{
          fontFamily: M, fontSize: 10, fontWeight: 700, color: "#e10600",
          padding: "3px 8px", background: "rgba(225,6,0,0.1)", borderRadius: 4,
        }}>LAP {currentState.lap}/{totalRaceLaps}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[1, 5, 15, 30].map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer",
              fontSize: 9, fontWeight: 700, fontFamily: M,
              background: speed === s ? "rgba(225,6,0,0.3)" : "rgba(255,255,255,0.04)",
              color: speed === s ? "#e10600" : "#5a5a6e",
            }}>{s}x</button>
          ))}
        </div>

        <button onClick={() => { setPlaying(false); setTimeIdx(0); }} style={{
          padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)",
          background: "transparent", color: "#5a5a6e", fontSize: 9, fontWeight: 700,
          cursor: "pointer", fontFamily: M,
        }}>RESET</button>
      </div>
    </div>
  );
}
