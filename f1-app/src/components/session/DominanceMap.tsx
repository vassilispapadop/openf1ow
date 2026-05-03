// Driver-dominance track map. Shows the circuit outline coloured by which
// driver in the comparison set was fastest *through* each segment.
//
// Method: bin the lap into N segments by distance along the racing line
// (using the longest trace as the reference). For each segment, compute
// time-through-segment for every driver via interpolation in their (x,y,
// distance,date) data. Driver with the lowest segment time wins; segment
// is rendered in their colour.

import { useMemo } from "react";
import { F, M, C } from "../../lib/styles";

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
  // Binary search for the smallest index whose distance >= dist.
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
  const frac = (dist - da) / (db - da);
  return ta + frac * (tb - ta);
}

export default function DominanceMap({ traces, height = 360, segments = DEFAULT_SEGMENTS }: Props) {
  const rendered = useMemo(() => {
    const usable = traces.filter(t => t.data.length > 10 && t.data.some(p => p.x != null && (p.x !== 0 || p.y !== 0)));
    if (usable.length < 2) return null;

    // Use the trace with the most points as the geometric reference so we
    // get the smoothest outline. The reference defines the (x,y) we draw;
    // every trace contributes to the per-segment "who was faster" decision.
    const ref = usable.reduce((best, t) => (t.data.length > best.data.length ? t : best));
    const refPts = ref.data.filter(p => p.x != null && (p.x !== 0 || p.y !== 0));
    if (refPts.length < 20) return null;

    // The shared distance range is min over all traces' max distances.
    const maxDist = Math.min(...usable.map(t => Math.max(...t.data.map(p => p.distance ?? 0))));
    if (!isFinite(maxDist) || maxDist < 100) return null;

    // Project (x,y) to viewport.
    const xs = refPts.map(p => p.x!);
    const ys = refPts.map(p => p.y!);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const VIEW_W = 800;
    const VIEW_H = Math.round(VIEW_W * (h / w));

    // Walk the reference outline in segments of ~segments along distance.
    // For each segment, look up time-through-segment for every trace and
    // pick the trace with the lowest. Colour the segment with that trace.
    const step = maxDist / segments;
    type Run = { color: string; label: string; pts: { x: number; y: number }[] };
    const runs: Run[] = [];
    let cur: Run | null = null;
    let winCount: Record<string, number> = {};
    let totalScored = 0;

    // Walk reference points; when we cross a segment boundary, decide the
    // winner of that segment using ALL traces.
    let prevSegIdx = -1;
    for (const p of refPts) {
      const d = p.distance ?? 0;
      if (d > maxDist) continue;
      const segIdx = Math.min(segments - 1, Math.floor(d / step));
      if (segIdx !== prevSegIdx) {
        // New segment — pick winner using time-through-segment.
        const segStart = segIdx * step;
        const segEnd = (segIdx + 1) * step;
        let bestTime = Infinity;
        let bestTrace: Trace | null = null;
        for (const t of usable) {
          const tStart = timeAtDistance(t.data, segStart);
          const tEnd = timeAtDistance(t.data, segEnd);
          if (tStart == null || tEnd == null) continue;
          const segTime = tEnd - tStart;
          if (segTime > 0 && segTime < bestTime) {
            bestTime = segTime;
            bestTrace = t;
          }
        }
        const winner = bestTrace ?? usable[0];
        const colour = "#" + winner.color;
        winCount[winner.label] = (winCount[winner.label] ?? 0) + 1;
        totalScored++;
        if (!cur || cur.color !== colour) {
          cur = { color: colour, label: winner.label, pts: [] };
          runs.push(cur);
          // Continuity: append the previous run's last point as the start of
          // this run so the SVG line doesn't visually break at colour
          // boundaries.
          const prevRun = runs[runs.length - 2];
          if (prevRun?.pts.length) {
            cur.pts.push(prevRun.pts[prevRun.pts.length - 1]);
          }
        }
        prevSegIdx = segIdx;
      }
      const px = ((p.x! - minX) / w) * VIEW_W;
      const py = VIEW_H - ((p.y! - minY) / h) * VIEW_H;
      cur!.pts.push({ x: px, y: py });
    }

    // Per-driver % share of segments won — used in the legend.
    const share = usable.map(t => ({
      label: t.label,
      color: "#" + t.color,
      pct: totalScored > 0 ? Math.round(((winCount[t.label] ?? 0) / totalScored) * 100) : 0,
    }));

    return { VIEW_W, VIEW_H, runs, share };
  }, [traces, segments]);

  if (!rendered) {
    return (
      <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>
        Add at least two laps with telemetry to see the dominance map.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", fontFamily: F }}>
      <svg
        viewBox={`-20 -20 ${rendered.VIEW_W + 40} ${rendered.VIEW_H + 40}`}
        style={{ width: "100%", height: "auto", maxHeight: height, display: "block" }}
        aria-label="Driver dominance map"
      >
        <path
          d={pathFrom(rendered.runs.flatMap(r => r.pts))}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {rendered.runs.map((run, i) => (
          <path
            key={i}
            d={pathFrom(run.pts)}
            fill="none"
            stroke={run.color}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        marginTop: 10,
        fontSize: 12,
        fontFamily: F,
      }}>
        {rendered.share.map(s => (
          <div key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, height: 4, background: s.color, borderRadius: 2 }} />
            <span style={{ color: C.text, fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: C.textMute, fontFamily: M }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function pathFrom(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return "M " + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
}
