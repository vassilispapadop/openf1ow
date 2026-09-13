// Driver-dominance track map: the circuit coloured by which driver in the
// comparison set was fastest *through* each stretch.
//
// Method: bin the lap into N segments by distance along the racing line
// (using the longest trace as the reference). For each segment, compute
// time-through-segment for every driver via interpolation in their (x, y,
// distance, date) data; the lowest wins and the stretch takes their colour.
// Drawing is charts/TrackOutline.

import { useMemo } from "react";
import TrackOutline, { type TrackRun } from "../../charts/TrackOutline";
import { C, M } from "../../lib/styles";

interface Trace {
  data: Array<{ date: string; distance?: number; x?: number; y?: number }>;
  color: string;       // hex, no leading #
  label: string;
}

interface Props {
  traces: Trace[];
  height?: number;
  segments?: number;
}

const DEFAULT_SEGMENTS = 120;

// Linear interpolation: cumulative elapsed time at a given track distance,
// in seconds since the trace's first sample. Trace data is assumed to be
// time-ordered with monotonically increasing `distance`.
function timeAtDistance(data: Trace["data"], dist: number): number | null {
  if (data.length < 2) return null;
  const t0 = new Date(data[0].date).getTime();
  let lo = 0, hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((data[mid].distance ?? 0) < dist) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return (new Date(data[0].date).getTime() - t0) / 1000;
  const a = data[lo - 1], b = data[lo];
  const da = a.distance ?? 0, db = b.distance ?? 0;
  const ta = (new Date(a.date).getTime() - t0) / 1000;
  const tb = (new Date(b.date).getTime() - t0) / 1000;
  if (db <= da) return ta;
  return ta + ((dist - da) / (db - da)) * (tb - ta);
}

export default function DominanceMap({ traces, height = 360, segments = DEFAULT_SEGMENTS }: Props) {
  const computed = useMemo(() => {
    const usable = traces.filter(t => t.data.length > 10 && t.data.some(p => p.x != null && (p.x !== 0 || p.y !== 0)));
    if (usable.length < 2) return null;
    const ref = usable.reduce((best, t) => (t.data.length > best.data.length ? t : best));
    const path = ref.data.map(p => ({ x: p.x ?? 0, y: p.y ?? 0 }));
    const maxDist = Math.min(...usable.map(t => Math.max(...t.data.map(p => p.distance ?? 0))));
    if (!isFinite(maxDist) || maxDist < 100) return null;

    const step = maxDist / segments;
    const runs: TrackRun[] = [];
    const winCount: Record<string, number> = {};
    let totalScored = 0;
    let prevSegIdx = -1;
    let cur: TrackRun | null = null;
    for (let i = 0; i < ref.data.length; i++) {
      const p = ref.data[i];
      const d = p.distance ?? 0;
      if (d > maxDist) continue;
      const segIdx = Math.min(segments - 1, Math.floor(d / step));
      if (segIdx !== prevSegIdx) {
        let bestTime = Infinity, bestTrace: Trace | null = null;
        for (const t of usable) {
          const ts = timeAtDistance(t.data, segIdx * step), te = timeAtDistance(t.data, (segIdx + 1) * step);
          if (ts == null || te == null) continue;
          const dt = te - ts;
          if (dt > 0 && dt < bestTime) { bestTime = dt; bestTrace = t; }
        }
        const winner = bestTrace ?? usable[0];
        winCount[winner.label] = (winCount[winner.label] ?? 0) + 1;
        totalScored++;
        const color = "#" + winner.color;
        if (!cur || cur.color !== color) {
          // Start the new run one point back so colour boundaries don't leave a gap.
          cur = { from: Math.max(0, i - 1), to: i, color };
          runs.push(cur);
        }
        prevSegIdx = segIdx;
      }
      if (cur) cur.to = i;
    }
    const share = usable.map(t => ({
      label: t.label, color: "#" + t.color,
      pct: totalScored > 0 ? Math.round(((winCount[t.label] ?? 0) / totalScored) * 100) : 0,
    }));
    return { path, runs, share };
  }, [traces, segments]);

  if (!computed) {
    return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>Add at least two laps with telemetry to see the dominance map.</div>;
  }

  return (
    <TrackOutline
      path={computed.path}
      runs={computed.runs}
      height={height}
      ariaLabel="Driver dominance map"
      legend={computed.share.map(sh => (
        <span key={sh.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ width: 14, height: 4, background: sh.color, borderRadius: 2 }} />
          <span style={{ color: C.text, fontWeight: 600 }}>{sh.label}</span>
          <span style={{ color: C.textMute, fontFamily: M }}>{sh.pct}%</span>
        </span>
      ))}
    />
  );
}
