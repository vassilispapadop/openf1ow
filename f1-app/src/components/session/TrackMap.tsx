// Speed-coloured track map of a single lap. Fetches /location for the
// driver+lap window and /car_data for speed; draws the racing line coloured
// by speed (blue = slow corner, red = top end) through charts/TrackOutline.
//
// Runs are grouped by speed bucket so consecutive points of similar speed
// share a stroke — ~BUCKETS paths for ~1000 location samples.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { C, M } from "../../lib/styles";
import Spinner from "../Spinner";
import TrackOutline, { type TrackRun } from "../../charts/TrackOutline";
import { lastIndexLE } from "../../engine/stats";

interface Props {
  sessionKey: string;
  driverNumber: number;
  driverColor?: string;        // fallback when speed data is missing
  lap: { date_start: string; lap_duration: number; lap_number: number };
  label?: string;              // shown in the corner of the map
  height?: number;
}

interface PointWithSpeed { x: number; y: number; speed: number }

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
      // Nearest car_data sample by timestamp (they don't share timestamps;
      // speed is ~4 Hz, location ~3.7 Hz). Binary search over the sorted feed.
      const carData = ((cd as { date: string; speed: number }[]) || [])
        .map(r => ({ t: new Date(r.date).getTime(), speed: r.speed }))
        .sort((a, b) => a.t - b.t);
      const speedAt = (iso: string): number => {
        if (!carData.length) return 0;
        const t = new Date(iso).getTime();
        const i = lastIndexLE(carData, r => r.t, t);
        const a = carData[Math.max(0, i)], b = carData[Math.min(carData.length - 1, i + 1)];
        return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a.speed : b.speed;
      };
      const out: PointWithSpeed[] = (loc as { x: number; y: number; date: string }[])
        .filter(p => p.x != null && p.y != null && (p.x !== 0 || p.y !== 0))
        .map(p => ({ x: p.x, y: p.y, speed: speedAt(p.date) }));
      setPoints(out);
      setLoading(false);
    }).catch(e => {
      setError(e?.message || "Failed to load");
      setLoading(false);
    });
  }, [sessionKey, driverNumber, lap?.date_start, lap?.lap_duration]);

  const built = useMemo(() => {
    if (points.length < 10) return null;
    const speeds = points.map(p => p.speed).filter(sp => sp > 0);
    const hasSpeed = speeds.length > 0;
    const minSpeed = hasSpeed ? Math.min(...speeds) : 0;
    const maxSpeed = hasSpeed ? Math.max(...speeds) : 1;
    const range = maxSpeed - minSpeed || 1;
    const fallback = "#" + (driverColor || "888");
    const colorOf = (bucket: number) => {
      if (!hasSpeed) return fallback;
      const hue = 220 - 220 * (bucket / Math.max(1, BUCKETS - 1));   // blue → red
      return `hsl(${hue}, 80%, 55%)`;
    };
    const bucketOf = (sp: number) => (sp <= 0 || !isFinite(sp) ? 0 : Math.min(BUCKETS - 1, Math.floor(((sp - minSpeed) / range) * BUCKETS)));
    const runs: TrackRun[] = [];
    let cur: TrackRun | null = null;
    let curBucket = -1;
    for (let i = 0; i < points.length; i++) {
      const b = bucketOf(points[i].speed);
      if (!cur || b !== curBucket) {
        cur = { from: Math.max(0, i - 1), to: i, color: colorOf(b), width: 3 };
        curBucket = b;
        runs.push(cur);
      } else cur.to = i;
    }
    return { runs, hasSpeed, minSpeed, maxSpeed };
  }, [points, driverColor]);

  if (loading) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner label="Loading track map…" /></div>;
  if (error) return <div style={{ color: C.textMute, fontSize: 12 }}>Map unavailable: {error}</div>;
  if (!built) return <div style={{ color: C.textMute, fontSize: 12 }}>Not enough location data for this lap.</div>;

  return (
    <TrackOutline
      path={points}
      runs={built.runs}
      height={height}
      corner={label}
      ariaLabel="Track map coloured by speed"
      legend={built.hasSpeed ? (
        <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontFamily: M, fontSize: 10, color: C.textDim, marginLeft: "auto" }}>
          <span>{Math.round(built.minSpeed)}</span>
          <span style={{ width: 80, height: 6, borderRadius: 3, background: "linear-gradient(90deg, hsl(220,80%,55%), hsl(110,80%,55%), hsl(0,80%,55%))" }} />
          <span>{Math.round(built.maxSpeed)} km/h</span>
        </span>
      ) : null}
    />
  );
}
