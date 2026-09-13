// The circuit drawn from the lap's own position fixes, coloured by how each
// part was classified — corner or straight. This is the check on the
// segmentation: hold it next to a circuit map and the amber stretches should
// land on the actual turns.

import { useMemo } from "react";
import { C, F, M } from "../../lib/styles";
import { SECTION_COLORS, SECTION_LABELS } from "../../lib/constants";
import type { TrackSegment } from "../../lib/lapSegments";

interface Props {
  path: { x: number; y: number }[];
  segments: TrackSegment[];
  height?: number;
}

const VIEW_W = 800;

export default function SectionMap({ path, segments, height = 340 }: Props) {
  const rendered = useMemo(() => {
    const usable = path.filter(p => p.x !== 0 || p.y !== 0);
    if (usable.length < 20) return null;

    const xs = usable.map(p => p.x), ys = usable.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const VIEW_H = Math.round(VIEW_W * (h / w));
    // Y is flipped: track coordinates count upward, SVG counts downward.
    const project = (p: { x: number; y: number }) => ({
      x: ((p.x - minX) / w) * VIEW_W,
      y: VIEW_H - ((p.y - minY) / h) * VIEW_H,
    });

    const runs = segments.map(seg => {
      // Extend one point into the next section so the outline has no gaps.
      const pts = path
        .slice(seg.startIdx, Math.min(path.length, seg.endIdx + 2))
        .filter(p => p.x !== 0 || p.y !== 0)
        .map(project);
      const mid = pts.length ? pts[Math.floor(pts.length / 2)] : null;
      return { seg, pts, mid };
    }).filter(r => r.pts.length > 1);

    return { VIEW_H, runs, outline: path.filter(p => p.x !== 0 || p.y !== 0).map(project) };
  }, [path, segments]);

  if (!rendered) return null;

  return (
    <div style={{ fontFamily: F }}>
      <svg
        viewBox={`-24 -24 ${VIEW_W + 48} ${rendered.VIEW_H + 48}`}
        style={{ width: "100%", height: "auto", maxHeight: height, display: "block" }}
        aria-label="Circuit map coloured by corner and straight sections"
      >
        <path
          d={pathFrom(rendered.outline)}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {rendered.runs.map((r, i) => (
          <path
            key={i}
            d={pathFrom(r.pts)}
            fill="none"
            stroke={SECTION_COLORS[r.seg.kind]}
            strokeWidth={r.seg.kind === "corner" ? 6 : r.seg.kind === "curve" ? 5 : 4}
            strokeOpacity={r.seg.kind === "straight" ? 0.6 : 0.95}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {rendered.runs.map((r, i) => (
          r.seg.kind !== "straight" && r.mid ? (
            <text
              key={"l" + i}
              x={r.mid.x}
              y={r.mid.y - 11}
              fontSize={17}
              fontFamily={M}
              fontWeight={700}
              fill={SECTION_COLORS[r.seg.kind]}
              textAnchor="middle"
              stroke="#0a0a0d"
              strokeWidth={4}
              paintOrder="stroke"
            >{r.seg.name}</text>
          ) : null
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 11, marginTop: 8, color: C.textDim, flexWrap: "wrap" }}>
        {(["corner", "curve", "straight"] as const).map(k => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 16,
              height: k === "corner" ? 5 : 4,
              borderRadius: 3,
              background: SECTION_COLORS[k],
              opacity: k === "straight" ? 0.6 : 1,
            }} />
            {SECTION_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

function pathFrom(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return "M " + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
}
