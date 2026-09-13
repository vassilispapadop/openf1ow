// The circuit drawn from the lap's own position fixes, coloured by how each
// part was classified — corner, fast curve or straight. This is the check on
// the segmentation: hold it next to a circuit map and the amber stretches
// should land on the actual turns. Adapter over charts/TrackOutline.

import { useMemo } from "react";
import TrackOutline, { type TrackRun } from "../../charts/TrackOutline";
import { SECTION_COLORS, SECTION_LABELS } from "../../lib/constants";
import type { TrackSegment } from "../../lib/lapSegments";

interface Props {
  path: { x: number; y: number }[];
  segments: TrackSegment[];
  height?: number;
  hoverIndex?: number | null;
}

export default function SectionMap({ path, segments, height = 340, hoverIndex }: Props) {
  const runs = useMemo<TrackRun[]>(() => segments.map(seg => ({
    // Extend one point into the next section so the outline has no gaps.
    from: seg.startIdx,
    to: seg.endIdx + 1,
    color: SECTION_COLORS[seg.kind],
    width: seg.kind === "corner" ? 6 : seg.kind === "curve" ? 5 : 4,
    opacity: seg.kind === "straight" ? 0.6 : 0.95,
    label: seg.kind !== "straight" ? seg.name : undefined,
  })), [segments]);

  return (
    <TrackOutline
      path={path}
      runs={runs}
      height={height}
      hoverIndex={hoverIndex}
      ariaLabel="Circuit map coloured by corner, fast-curve and straight sections"
      onEmpty={null}
      legend={(["corner", "curve", "straight"] as const).map(k => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: k === "corner" ? 5 : 4, borderRadius: 3, background: SECTION_COLORS[k], opacity: k === "straight" ? 0.6 : 1 }} />
          {SECTION_LABELS[k]}
        </span>
      ))}
    />
  );
}
