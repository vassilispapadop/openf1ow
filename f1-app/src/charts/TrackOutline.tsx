// The circuit, drawn from position fixes and coloured by whatever the caller
// wants to say about each stretch: speed, section kind, which driver was
// quickest there. One drawing for the speed map, the dominance map and the
// section map — the projection, ghost outline and label halo are shared.

import { useMemo, useRef, type ReactNode, type PointerEvent } from "react";
import { projectTrack, pathFrom, slicePath, type XY } from "./core/trackProjection.ts";
import s from "./TrackOutline.module.css";

export interface TrackRun {
  from: number;            // inclusive original path index
  to: number;              // inclusive; runs may overlap by a point to avoid gaps
  color: string;
  width?: number;
  opacity?: number;
  label?: string;          // drawn at the run's midpoint with a halo
  labelColor?: string;
  id?: number;             // groups runs (a section split at the line) for hover/click
}

export interface TrackOutlineProps {
  path: XY[];
  runs: TrackRun[];
  height?: number;
  hoverIndex?: number | null;     // original path index to mark
  hoverColor?: string;
  corner?: ReactNode;             // small label at top-left (e.g. "NOR · L18")
  legend?: ReactNode;             // rendered below the map
  ariaLabel?: string;
  onEmpty?: ReactNode;
  onRunHover?: (id: number | null) => void;   // pointer over / off a run that has an id
  onRunClick?: (id: number) => void;
  /** Extra dots in raw position coordinates (e.g. where each lap's car is). */
  markers?: { x: number; y: number; color: string }[];
  /** Small labelled ticks on the line, in raw position coordinates (sector lines). */
  pins?: { x: number; y: number; label: string }[];
  /** Pointer position as the nearest original path index, null when it leaves
   *  the circuit — lets the map drive a crosshair elsewhere. */
  onPointerIndex?: (i: number | null) => void;
}

/** How near (viewBox units) the pointer must be to the line to count as on it. */
const POINTER_REACH = 45;

export default function TrackOutline({ path, runs, height = 360, hoverIndex, hoverColor, corner, legend, ariaLabel, onEmpty, onRunHover, onRunClick, markers, pins, onPointerIndex }: TrackOutlineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const proj = useMemo(() => projectTrack(path), [path]);
  const drawn = useMemo(() => {
    if (!proj) return [];
    return runs.map(r => {
      const pts = slicePath(proj, path, r.from, r.to);
      return { ...r, pts, mid: pts.length ? pts[Math.floor(pts.length / 2)] : null };
    }).filter(r => r.pts.length > 1);
  }, [proj, path, runs]);

  if (!proj) return <>{onEmpty ?? <div className={s.empty}>Not enough location data for this lap.</div>}</>;

  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current, ctm = svg?.getScreenCTM();
    if (!onPointerIndex || !svg || !ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(ctm.inverse());
    let best = -1, bestD2 = Infinity;
    for (let i = 0; i < proj.points.length; i++) {
      const dx = proj.points[i].x - q.x, dy = proj.points[i].y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = i; }
    }
    onPointerIndex(best >= 0 && bestD2 <= POINTER_REACH * POINTER_REACH ? proj.indexMap[best] : null);
  };

  const hover = hoverIndex != null && path[hoverIndex] && (path[hoverIndex].x !== 0 || path[hoverIndex].y !== 0)
    ? proj.project(path[hoverIndex]) : null;

  return (
    <div className={s.wrap}>
      <svg
        ref={svgRef}
        onPointerMove={onPointerIndex ? pointerMove : undefined}
        onPointerLeave={onPointerIndex ? () => onPointerIndex(null) : undefined}
        viewBox={`-24 -24 ${proj.viewW + 48} ${proj.viewH + 48}`}
        className={s.svg}
        style={{ maxHeight: height }}
        role="img"
        aria-label={ariaLabel ?? "Track map"}
      >
        <path d={pathFrom(proj.points)} fill="none" className={s.ghost} strokeLinecap="round" strokeLinejoin="round" />
        {drawn.map((r, i) => (
          <path key={i} d={pathFrom(r.pts)} fill="none" stroke={r.color} strokeWidth={r.width ?? 3.5} strokeOpacity={r.opacity ?? 0.95}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {drawn.map((r, i) => r.label && r.mid ? (
          <text key={"l" + i} x={r.mid.x} y={r.mid.y - 11} className={s.label} style={{ fill: r.labelColor ?? r.color }} textAnchor="middle">{r.label}</text>
        ) : null)}
        {/* Wide transparent strokes on top: a 4-6 px line is too thin to aim at. */}
        {(onRunHover || onRunClick) && drawn.map((r, i) => r.id == null ? null : (
          <path key={"h" + i} d={pathFrom(r.pts)} fill="none" stroke="transparent" strokeWidth={26} pointerEvents="stroke"
            strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "pointer" }}
            onMouseEnter={() => onRunHover?.(r.id!)} onMouseLeave={() => onRunHover?.(null)}
            onClick={() => onRunClick?.(r.id!)} />
        ))}
        {pins?.map((p, i) => {
          const q = proj.project(p);
          return (
            <g key={"p" + i} pointerEvents="none">
              <circle cx={q.x} cy={q.y} r={5} fill="var(--bg, #0a0a0d)" stroke="var(--text-dim)" strokeWidth={2} />
              <text x={q.x} y={q.y - 12} className={s.label} style={{ fill: "var(--text-dim)", fontSize: 14 }} textAnchor="middle">{p.label}</text>
            </g>
          );
        })}
        {markers?.map((m, i) => {
          if (m.x === 0 && m.y === 0) return null;
          const q = proj.project(m);
          return <circle key={"m" + i} data-export="hide" cx={q.x} cy={q.y} r={8} fill={m.color} stroke="var(--chart-halo)" strokeWidth={3} pointerEvents="none" />;
        })}
        {hover && (
          <circle data-export="hide" cx={hover.x} cy={hover.y} r={9} fill={hoverColor ?? "var(--text)"} stroke="var(--chart-halo)" strokeWidth={3} />
        )}
      </svg>
      {corner && <div className={s.corner}>{corner}</div>}
      {legend && <div className={s.legend}>{legend}</div>}
    </div>
  );
}
