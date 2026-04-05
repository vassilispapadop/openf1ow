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

export default function RaceReplay({ sessionKey, drivers }: { sessionKey: string; drivers: Driver[] }) {
  const [allPoints, setAllPoints] = useState<LocPoint[][]>([]);
  const [trackOutline, setTrackOutline] = useState<{ x: number; y: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [timeIdx, setTimeIdx] = useState(0);
  const [speed, setSpeed] = useState(20);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const timeIdxRef = useRef(0);
  timeIdxRef.current = timeIdx;

  // Global time axis (shared timestamps across all drivers)
  const timeAxis = useMemo(() => {
    if (!allPoints.length) return [];
    // Use first driver with data to define the time axis
    const first = allPoints.find(p => p.length > 0);
    if (!first) return [];
    return first.map(p => p.ts);
  }, [allPoints]);

  const totalFrames = timeAxis.length;

  // Build driver color map
  const drvMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  // Fetch location data
  const load = useCallback(async () => {
    if (!sessionKey || !drivers.length) return;
    setLoading(true);
    setError("");
    setProgress("Fetching race start time...");

    try {
      // Get race start time from session
      const sessions = await fetchJson("/sessions?session_key=" + sessionKey);
      const raceStart = sessions[0]?.date_start;
      if (!raceStart) throw new Error("No race start time found");

      // Fetch location data for each driver in parallel batches
      const BATCH = 5;
      const driverNums = drivers.map(d => d.driver_number);
      const allData: LocPoint[][] = [];

      for (let i = 0; i < driverNums.length; i += BATCH) {
        const batch = driverNums.slice(i, i + BATCH);
        setProgress(`Loading driver positions (${Math.min(i + BATCH, driverNums.length)}/${driverNums.length})...`);
        const results = await Promise.all(
          batch.map(dn =>
            fetchJson(`/location?session_key=${sessionKey}&driver_number=${dn}&date>=${raceStart}`)
              .catch(() => [])
          )
        );
        results.forEach((data, idx) => {
          const dn = batch[idx];
          // Subsample to ~0.5s intervals
          const points: LocPoint[] = [];
          let lastTs = 0;
          for (const p of data) {
            const ts = new Date(p.date).getTime();
            if (ts - lastTs >= 450) {
              points.push({ x: p.x, y: p.y, ts, dn });
              lastTs = ts;
            }
          }
          allData.push(points);
        });
      }

      // Derive track outline from the driver with most data (first 1 lap worth)
      setProgress("Building track map...");
      const longest = allData.reduce((a, b) => a.length > b.length ? a : b, []);
      if (longest.length < 100) throw new Error("Not enough location data");

      // Use first ~300 points (~2.5 min, roughly 1 lap at Suzuka)
      // Detect lap by finding when the car returns close to starting position
      const start = longest[0];
      let lapEnd = 300;
      for (let i = 200; i < Math.min(longest.length, 1000); i++) {
        const dx = longest[i].x - start.x;
        const dy = longest[i].y - start.y;
        if (Math.sqrt(dx * dx + dy * dy) < 300) {
          lapEnd = i;
          break;
        }
      }
      const outline = longest.slice(0, lapEnd).map(p => ({ x: p.x, y: p.y }));
      setTrackOutline(outline);

      // Normalize all drivers to same time axis (the longest driver's timestamps)
      // Subsample all to common ~0.5s grid
      const refTimes = longest.map(p => p.ts);
      const aligned: LocPoint[][] = allData.map(driverPts => {
        if (!driverPts.length) return refTimes.map(ts => ({ x: 0, y: 0, ts, dn: 0 }));
        const result: LocPoint[] = [];
        let j = 0;
        for (const ts of refTimes) {
          while (j < driverPts.length - 1 && driverPts[j + 1].ts <= ts) j++;
          // Interpolate between j and j+1
          if (j < driverPts.length - 1 && driverPts[j].ts <= ts) {
            const t0 = driverPts[j].ts, t1 = driverPts[j + 1].ts;
            const frac = t1 > t0 ? (ts - t0) / (t1 - t0) : 0;
            result.push({
              x: driverPts[j].x + (driverPts[j + 1].x - driverPts[j].x) * frac,
              y: driverPts[j].y + (driverPts[j + 1].y - driverPts[j].y) * frac,
              ts,
              dn: driverPts[j].dn,
            });
          } else {
            result.push(driverPts[j] ? { ...driverPts[j], ts } : { x: 0, y: 0, ts, dn: 0 });
          }
        }
        return result;
      });

      setAllPoints(aligned);
      setTimeIdx(0);
      setProgress("");
    } catch (e: any) {
      setError(e.message || "Failed to load location data");
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
    const H = 500;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Compute bounds from track outline
    const allX = trackOutline.map(p => p.x);
    const allY = trackOutline.map(p => p.y);
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const trackW = maxX - minX || 1, trackH = maxY - minY || 1;
    const PAD = 40;
    const scaleX = (W - PAD * 2) / trackW;
    const scaleY = (H - PAD * 2) / trackH;
    const scale = Math.min(scaleX, scaleY);
    const offX = PAD + (W - PAD * 2 - trackW * scale) / 2;
    const offY = PAD + (H - PAD * 2 - trackH * scale) / 2;

    const toScreen = (x: number, y: number): [number, number] => [
      offX + (x - minX) * scale,
      offY + (maxY - y) * scale, // flip Y
    ];

    // Background
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

    // Draw track outline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 14;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trackOutline.forEach((p, i) => {
      const [sx, sy] = toScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();

    // Track surface
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 12;
    ctx.stroke();

    // Draw drivers at current time index
    if (idx < 0 || idx >= totalFrames) return;

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

    // Time info
    if (timeAxis[idx]) {
      const elapsed = (timeAxis[idx] - timeAxis[0]) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      ctx.font = `bold 12px ${M}`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "left";
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, 12, 20);

      // Progress bar
      const pct = idx / totalFrames;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, H - 3, W, 3);
      ctx.fillStyle = "#e10600";
      ctx.fillRect(0, H - 3, W * pct, 3);
    }
  }, [trackOutline, allPoints, totalFrames, timeAxis, drvMap]);

  // Draw on timeIdx change
  useEffect(() => { draw(timeIdx); }, [timeIdx, draw]);

  // Animation loop
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      setTimeIdx(prev => {
        const next = prev + speed;
        if (next >= totalFrames) { setPlaying(false); return totalFrames - 1; }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, totalFrames]);

  // Not loaded yet
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
          Watch the race unfold on the actual track layout. Each driver is shown as a colored dot moving in real-time. Requires downloading position data for all drivers.
        </p>
        {error && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button onClick={load} style={{
          background: "linear-gradient(135deg, #e10600, #a855f7)",
          color: "#fff", border: "none", borderRadius: 10,
          padding: "12px 32px", fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: F, letterSpacing: "0.3px",
        }}>
          Load Race Replay
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{
          width: 40, height: 40,
          border: "3px solid rgba(255,255,255,0.04)",
          borderTopColor: "#e10600",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
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
      {/* Canvas */}
      <div ref={wrapRef} style={{ position: "relative", marginBottom: 14 }}>
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 12 }} />
      </div>

      {/* Controls */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", background: "rgba(12,12,24,0.6)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        {/* Play/Pause */}
        <button onClick={() => {
          if (timeIdx >= totalFrames - 1) setTimeIdx(0);
          setPlaying(!playing);
        }} style={{
          width: 36, height: 36, borderRadius: 8,
          background: playing ? "rgba(225,6,0,0.2)" : "linear-gradient(135deg, #e10600, #b80500)",
          border: "none", cursor: "pointer", color: "#fff",
          fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: playing ? "none" : "0 2px 10px rgba(225,6,0,0.3)",
        }}>
          {playing ? "||" : "\u25B6"}
        </button>

        {/* Time scrubber */}
        <input
          type="range" min={0} max={Math.max(totalFrames - 1, 0)} value={timeIdx}
          onChange={e => { setPlaying(false); setTimeIdx(Number(e.target.value)); }}
          style={{ flex: 1, minWidth: 120, accentColor: "#e10600", cursor: "pointer" }}
        />

        {/* Time display */}
        <div style={{ fontFamily: M, fontSize: 12, fontWeight: 600, color: "#b0b0c0", minWidth: 48 }}>
          {mins}:{secs.toString().padStart(2, "0")}
        </div>

        {/* Speed control */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[5, 20, 50, 100].map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer",
              fontSize: 9, fontWeight: 700, fontFamily: M,
              background: speed === s ? "rgba(225,6,0,0.3)" : "rgba(255,255,255,0.04)",
              color: speed === s ? "#e10600" : "#5a5a6e",
            }}>{s === 5 ? "0.25x" : s === 20 ? "1x" : s === 50 ? "2.5x" : "5x"}</button>
          ))}
        </div>

        {/* Reset */}
        <button onClick={() => { setPlaying(false); setTimeIdx(0); }} style={{
          padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)",
          background: "transparent", color: "#5a5a6e", fontSize: 9, fontWeight: 700,
          cursor: "pointer", fontFamily: M,
        }}>RESET</button>
      </div>
    </div>
  );
}
