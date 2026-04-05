import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Driver } from "../lib/types";
import { F, M, sty } from "../lib/styles";

const PROXY = "https://corsproxy.io/?";
const API = "https://api.openf1.org/v1";

async function fetchJson(path: string) {
  const urls = [API + path, PROXY + encodeURIComponent(API + path)];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error("Failed: " + path);
}

interface LocPoint { x: number; y: number; ts: number; dn: number }
interface LapCrossing { dn: number; lap: number; ts: number }

export default function RaceReplay({ sessionKey, drivers }: { sessionKey: string; drivers: Driver[] }) {
  const [allPoints, setAllPoints] = useState<LocPoint[][]>([]);
  const [trackOutline, setTrackOutline] = useState<{ x: number; y: number }[]>([]);
  const [lapCrossings, setLapCrossings] = useState<LapCrossing[]>([]);
  const [totalRaceLaps, setTotalRaceLaps] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [timeIdx, setTimeIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
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

  // Compute current lap number and positions for the timing tower
  const currentState = useMemo(() => {
    if (!timeAxis.length || !lapCrossings.length) return { lap: 0, positions: [] as { dn: number; gap: string; pos: number }[] };
    const now = timeAxis[timeIdx] || 0;

    // Current lap: latest lap crossing for the leader before current time
    const leaderCrossings = lapCrossings
      .filter(c => c.ts <= now)
      .sort((a, b) => b.lap - a.lap);
    const currentLap = leaderCrossings.length > 0 ? leaderCrossings[0].lap : 1;

    // Positions: for each driver, find their latest lap crossing
    const driverLatest: Record<number, { lap: number; ts: number }> = {};
    lapCrossings.forEach(c => {
      if (c.ts <= now) {
        if (!driverLatest[c.dn] || c.lap > driverLatest[c.dn].lap) {
          driverLatest[c.dn] = { lap: c.lap, ts: c.ts };
        }
      }
    });

    // Leader is the driver with the highest lap number and earliest timestamp
    const entries = Object.entries(driverLatest).map(([dn, { lap, ts }]) => ({ dn: Number(dn), lap, ts }));
    entries.sort((a, b) => b.lap - a.lap || a.ts - b.ts);

    const leaderTs = entries[0]?.ts || now;
    const positions = entries.map((e, i) => {
      let gap: string;
      if (i === 0) {
        gap = "LEADER";
      } else if (e.lap < entries[0].lap) {
        const lapDiff = entries[0].lap - e.lap;
        gap = "+" + lapDiff + " LAP" + (lapDiff > 1 ? "S" : "");
      } else {
        const diff = (e.ts - leaderTs) / 1000;
        gap = "+" + diff.toFixed(1);
      }
      return { dn: e.dn, gap, pos: i + 1 };
    });

    return { lap: Math.min(currentLap, totalRaceLaps), positions };
  }, [timeIdx, timeAxis, lapCrossings, totalRaceLaps]);

  // Fetch data
  const load = useCallback(async () => {
    if (!sessionKey || !drivers.length) return;
    setLoading(true);
    setError("");
    setProgress("Fetching race info...");

    try {
      const sessions = await fetchJson("/sessions?session_key=" + sessionKey);
      const raceStart = sessions[0]?.date_start;
      if (!raceStart) throw new Error("No race start time found");

      // Fetch laps to know lap boundaries
      setProgress("Loading lap data...");
      const laps = await fetchJson("/laps?session_key=" + sessionKey);
      const crossings: LapCrossing[] = [];
      let maxLap = 0;
      laps.forEach((l: any) => {
        if (l.date_start && l.lap_number >= 1) {
          crossings.push({ dn: l.driver_number, lap: l.lap_number, ts: new Date(l.date_start).getTime() });
          if (l.lap_number > maxLap) maxLap = l.lap_number;
        }
      });
      setLapCrossings(crossings);
      setTotalRaceLaps(maxLap);

      // Start from lights out (Lap 1 date_start) — skip formation lap and grid wait
      const lap1Starts = crossings.filter(c => c.lap === 1).map(c => c.ts);
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
            fetchJson(`/location?session_key=${sessionKey}&driver_number=${dn}&date>=${lightsOut}`)
              .catch(() => [])
          )
        );
        results.forEach((data, idx) => {
          const dn = batch[idx];
          if (!Array.isArray(data) || data.length < 100) return;
          const points: LocPoint[] = [];
          let lastTs = 0;
          for (const p of data) {
            const ts = new Date(p.date).getTime();
            if (ts - lastTs >= 450) {
              points.push({ x: p.x, y: p.y, ts, dn });
              lastTs = ts;
            }
          }
          if (points.length > 50) rawData.push({ dn, points });
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

  // Canvas rendering
  const draw = useCallback((idx: number) => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap || !trackOutline.length || !allPoints.length) return;

    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = 520;
    const TOWER_W = 180; // timing tower width
    const MAP_W = W - TOWER_W;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

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
      const color = "#" + (drv.team_colour || "666");

      // Row background
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
      ctx.fillRect(towerX, y, TOWER_W, ROW_H);

      // Team color bar
      ctx.fillStyle = color;
      ctx.fillRect(towerX, y, 3, ROW_H);

      // Position number
      ctx.font = `bold 10px ${M}`;
      ctx.fillStyle = i < 3 ? (i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : "#CD7F32") : "#5a5a6e";
      ctx.textAlign = "right";
      ctx.fillText(String(p.pos), towerX + 22, y + 15);

      // Driver acronym
      ctx.font = `bold 10px ${F}`;
      ctx.fillStyle = "#e8e8ec";
      ctx.textAlign = "left";
      ctx.fillText(drv.name_acronym, towerX + 28, y + 15);

      // Gap
      ctx.font = `9px ${M}`;
      ctx.fillStyle = p.gap === "LEADER" ? "#22c55e" : p.gap.includes("LAP") ? "#ef4444" : "#6a6a7e";
      ctx.textAlign = "right";
      ctx.fillText(p.gap, TOWER_W - 6, y + 15);
    });

    // === TRACK MAP (right side) ===
    const allX = trackOutline.map(p => p.x);
    const allY = trackOutline.map(p => p.y);
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
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
    if (idx >= 0 && idx < totalFrames) {
      allPoints.forEach(driverPts => {
        if (idx >= driverPts.length) return;
        const pt = driverPts[idx];
        if (!pt || pt.dn === 0) return;
        const drv = drvMap[pt.dn];
        if (!drv) return;

        const [sx, sy] = toScreen(pt.x, pt.y);
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
  }, [trackOutline, allPoints, totalFrames, timeAxis, drvMap, currentState, totalRaceLaps]);

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
