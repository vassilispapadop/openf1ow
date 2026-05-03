// Speed-coloured track map of a single lap. Fetches /location for the
// driver+lap window and /car_data for speed; renders SVG with the racing
// line coloured by speed (blue = slow corner, red = top end).
//
// One <path> per speed bucket so consecutive points of similar speed
// share a stroke — keeps the SVG light (typically <30 path elements
// for ~1000 location samples).

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { F, M, C } from "../../lib/styles";
import Spinner from "../Spinner";

interface Props {
  sessionKey: string;
  driverNumber: number;
  driverColor?: string;        // fallback when speed data is missing
  lap: { date_start: string; lap_duration: number; lap_number: number };
  label?: string;              // shown in the corner of the map
  height?: number;
}

interface PointWithSpeed { x: number; y: number; speed: number; }

const BUCKETS = 10;

export default function TrackMap({ sessionKey, driverNumber, driverColor, lap, label, height = 360 }: Props) {
  const [points, setPoints] = useState<PointWithSpeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lap?.date_start || !lap?.lap_duration) return;
    setLoading(true);
    setError("");
    const start = lap.date_start;
    const end = new Date(new Date(start).getTime() + lap.lap_duration * 1000 + 1000).toISOString();
    const q = `?session_key=${sessionKey}&driver_number=${driverNumber}&date>=${start}&date<=${end}`;
    Promise.all([
      api(`/location${q}`),
      api(`/car_data${q}`).catch(() => []),
    ]).then(([loc, cd]: any) => {
      const carData = (cd as { date: string; speed: number }[]) || [];
      const out: PointWithSpeed[] = (loc as { x: number; y: number; date: string }[])
        .filter(p => p.x != null && p.y != null && (p.x !== 0 || p.y !== 0))
        .map(p => ({ x: p.x, y: p.y, speed: nearestSpeed(p.date, carData) }));
      setPoints(out);
      setLoading(false);
    }).catch(e => {
      setError(e?.message || "Failed to load");
      setLoading(false);
    });
  }, [sessionKey, driverNumber, lap?.date_start, lap?.lap_duration]);

  const rendered = useMemo(() => {
    if (points.length < 10) return null;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const VIEW_W = 800;
    const VIEW_H = Math.round(VIEW_W * (h / w));

    const speeds = points.map(p => p.speed).filter(s => s > 0);
    const minSpeed = speeds.length ? Math.min(...speeds) : 0;
    const maxSpeed = speeds.length ? Math.max(...speeds) : 1;
    const speedRange = maxSpeed - minSpeed || 1;

    // Project to SVG space (flip Y so the track reads "right way up").
    const project = (p: PointWithSpeed) => ({
      x: ((p.x - minX) / w) * VIEW_W,
      y: VIEW_H - ((p.y - minY) / h) * VIEW_H,
      speed: p.speed,
    });
    const proj = points.map(project);

    // Bucket each segment by speed → group consecutive same-bucket segments
    // into one path so we render ~BUCKETS paths instead of N lines.
    const bucketOf = (sp: number): number => {
      if (sp <= 0 || !isFinite(sp)) return 0;
      return Math.min(BUCKETS - 1, Math.floor(((sp - minSpeed) / speedRange) * BUCKETS));
    };

    type Run = { bucket: number; pts: { x: number; y: number }[] };
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (let i = 0; i < proj.length; i++) {
      const b = bucketOf(proj[i].speed);
      if (!cur || cur.bucket !== b) {
        if (cur) cur.pts.push({ x: proj[i].x, y: proj[i].y });
        cur = { bucket: b, pts: [{ x: proj[i].x, y: proj[i].y }] };
        runs.push(cur);
      } else {
        cur.pts.push({ x: proj[i].x, y: proj[i].y });
      }
    }

    return {
      VIEW_W, VIEW_H, runs, minSpeed, maxSpeed,
      hasSpeed: speeds.length > 0,
    };
  }, [points]);

  if (loading) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>;
  if (error) return <div style={{ color: C.textMute, fontSize: 12 }}>Map unavailable: {error}</div>;
  if (!rendered) return <div style={{ color: C.textMute, fontSize: 12 }}>Not enough location data for this lap.</div>;

  const fallback = "#" + (driverColor || "888");
  const speedToColor = (bucket: number): string => {
    // 0 = slow (blue), BUCKETS-1 = fast (red)
    if (!rendered.hasSpeed) return fallback;
    const t = bucket / Math.max(1, BUCKETS - 1);
    const hue = 220 - 220 * t;        // 220° blue → 0° red
    return `hsl(${hue}, 80%, 55%)`;
  };

  return (
    <div style={{ position: "relative", fontFamily: F }}>
      <svg
        viewBox={`-20 -20 ${rendered.VIEW_W + 40} ${rendered.VIEW_H + 40}`}
        style={{ width: "100%", height: "auto", maxHeight: height, display: "block" }}
        aria-label="Track map"
      >
        {/* Track-edge ghost — slightly thicker, low opacity */}
        <path
          d={pathFrom(rendered.runs.flatMap(r => r.pts))}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Coloured racing line */}
        {rendered.runs.map((run, i) => (
          <path
            key={i}
            d={pathFrom(run.pts)}
            fill="none"
            stroke={speedToColor(run.bucket)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {/* Legend + label */}
      <div style={{
        position: "absolute",
        bottom: 6,
        right: 8,
        display: "flex",
        gap: 10,
        alignItems: "center",
        fontFamily: M,
        fontSize: 10,
        color: C.textDim,
      }}>
        {rendered.hasSpeed && (
          <>
            <span>{Math.round(rendered.minSpeed)}</span>
            <div style={{
              width: 80,
              height: 6,
              borderRadius: 3,
              background: "linear-gradient(90deg, hsl(220,80%,55%), hsl(110,80%,55%), hsl(0,80%,55%))",
            }} />
            <span>{Math.round(rendered.maxSpeed)} km/h</span>
          </>
        )}
      </div>

      {label && (
        <div style={{
          position: "absolute",
          top: 8,
          left: 12,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: C.textMute,
          fontFamily: F,
        }}>{label}</div>
      )}
    </div>
  );
}

function pathFrom(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return "M " + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
}

// Binary-search nearest car_data record by timestamp. Speed values arrive
// at ~4 Hz, location at ~3.7 Hz — they don't share timestamps, so we
// nearest-match.
function nearestSpeed(locDate: string, carData: { date: string; speed: number }[]): number {
  if (!carData.length) return 0;
  const t = new Date(locDate).getTime();
  // Most car_data is roughly time-ordered; linear scan is fine for ~1k points.
  let bestSpeed = carData[0].speed;
  let bestDt = Math.abs(new Date(carData[0].date).getTime() - t);
  for (let i = 1; i < carData.length; i++) {
    const dt = Math.abs(new Date(carData[i].date).getTime() - t);
    if (dt < bestDt) { bestDt = dt; bestSpeed = carData[i].speed; }
  }
  return bestSpeed;
}
