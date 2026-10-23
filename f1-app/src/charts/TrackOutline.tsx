// The circuit, drawn from position fixes and coloured by whatever the caller
// wants to say about each stretch: speed, section kind, which driver was
// quickest there. One drawing for the speed map, the dominance map and the
// section map — the projection, ghost outline and label halo are shared.

import { useMemo, type ReactNode } from "react";
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
}

export default function TrackOutline({ path, runs, height = 360, hoverIndex, hoverColor, corner, legend, ariaLabel, onEmpty, onRunHover, onRunClick }: TrackOutlineProps) {
  const proj = useMemo(() => projectTrack(path), [path]);
  const drawn = useMemo(() => {
    if (!proj) return [];
    return runs.map(r => {
      const pts = slicePath(proj, path, r.from, r.to);
      return { ...r, pts, mid: pts.length ? pts[Math.floor(pts.length / 2)] : null };
    }).filter(r => r.pts.length > 1);
  }, [proj, path, runs]);

  if (!proj) return <>{onEmpty ?? <div className={s.empty}>Not enough location data for this lap.</div>}</>;

  const hover = hoverIndex != null && path[hoverIndex] && (path[hoverIndex].x !== 0 || path[hoverIndex].y !== 0)
    ? proj.project(path[hoverIndex]) : null;

  return (
    <div className={s.wrap}>
      <svg
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
        {hover && (
          <circle data-export="hide" cx={hover.x} cy={hover.y} r={9} fill={hoverColor ?? "var(--text)"} stroke="var(--chart-halo)" strokeWidth={3} />
        )}
      </svg>
      {corner && <div className={s.corner}>{corner}</div>}
      {legend && <div className={s.legend}>{legend}</div>}
    </div>
  );
}
