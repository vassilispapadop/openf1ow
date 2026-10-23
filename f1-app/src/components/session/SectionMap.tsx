// The circuit drawn from the lap's own position fixes, coloured by how each
// part was classified — corner, fast curve or straight. This is the check on
// the segmentation: hold it next to a circuit map and the amber stretches
// should land on the actual turns. Adapter over charts/TrackOutline.

import { useMemo } from "react";
import TrackOutline, { type TrackRun } from "../../charts/TrackOutline";
import { SECTION_COLORS, SECTION_LABELS } from "../../lib/constants";
import type { TrackSegment } from "../../lib/lapSegments";

export type MapMode = "gain" | "kind";

interface Props {
  path: { x: number; y: number }[];
  segments: TrackSegment[];
  height?: number;
  hoverIndex?: number | null;
  /** "kind": corner / fast curve / straight. "gain": the driver quickest
   *  through each section, stronger where the gap is bigger. */
  mode?: MapMode;
  /** Segment index being hovered or pinned; the rest of the map dims. */
  active?: number | null;
  onHover?: (i: number | null) => void;
  onSelect?: (i: number) => void;
  /** Drivers in the comparison, for the "gain" legend. */
  drivers?: { label: string; color: string }[];
  /** Gap (s) at which a section counts as fully "won". */
  maxSpread?: number;
}

export const LEVEL_GAP = 5e-3;

export function sectionWinner(seg: TrackSegment) {
  const best = seg.timings.reduce((m, t) => (t.time < m.time ? t : m), seg.timings[0]);
  const slowest = seg.timings.reduce((m, t) => (t.time > m.time ? t : m), seg.timings[0]);
  return { best, slowest, spread: slowest.time - best.time };
}

export default function SectionMap({ path, segments, height = 340, hoverIndex, mode = "kind", active = null, onHover, onSelect, drivers = [], maxSpread = 0.1 }: Props) {
  const runs = useMemo<TrackRun[]>(() => segments.flatMap((seg, i) => {
    const { best, spread } = sectionWinner(seg);
    const level = spread < LEVEL_GAP;
    const gain = mode === "gain";
    const isActive = active === i;
    let opacity = gain
      ? (level ? 0.25 : 0.45 + 0.55 * Math.min(1, spread / maxSpread))
      : (seg.kind === "straight" ? 0.6 : 0.95);
    if (active != null && !isActive) opacity *= 0.35;
    const style = {
      color: gain ? (level ? "#8a8a94" : "#" + best.color) : SECTION_COLORS[seg.kind],
      width: (seg.kind === "corner" ? 6 : seg.kind === "curve" ? 5 : 4) + (isActive ? 3 : 0),
      opacity: isActive ? 1 : opacity,
      // Corners are always named; a straight is named only while it's inspected.
      label: seg.kind !== "straight" || isActive ? seg.name : undefined,
      id: i,
    };
    // A section that crosses the line is drawn in two pieces: from its start
    // to the end of the path, and from the path's start to its end.
    if (seg.wraps) {
      return [
        { from: seg.startIdx, to: path.length - 1, ...style },
        { from: 0, to: seg.endIdx + 1, ...style, label: undefined },
      ];
    }
    // Extend one point into the next section so the outline has no gaps.
    return [{ from: seg.startIdx, to: seg.endIdx + 1, ...style }];
  }), [segments, path.length, mode, active, maxSpread]);

  return (
    <TrackOutline
      path={path}
      runs={runs}
      height={height}
      hoverIndex={hoverIndex}
      ariaLabel="Circuit map coloured by corner, fast-curve and straight sections"
      onEmpty={null}
      onRunHover={onHover}
      onRunClick={onSelect}
      legend={mode === "gain" ? (
        <>
          {drivers.map(d => (
            <span key={d.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 5, borderRadius: 3, background: "#" + d.color }} />
              quickest: {d.label}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 5, borderRadius: 3, background: "#8a8a94", opacity: 0.4 }} />
            level
          </span>
          <span style={{ color: "var(--text-mute)" }}>stronger colour = bigger gap</span>
        </>
      ) : (["corner", "curve", "straight"] as const).map(k => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: k === "corner" ? 5 : 4, borderRadius: 3, background: SECTION_COLORS[k], opacity: k === "straight" ? 0.6 : 1 }} />
          {SECTION_LABELS[k]}
        </span>
      ))}
    />
  );
}
