// A placeholder that holds the shape of what's loading, so the page doesn't
// jump when the data lands. `Skeleton` is one shimmering block; compose them.

import type { CSSProperties } from "react";
import s from "./Skeleton.module.css";

export default function Skeleton({ width = "100%", height = 16, radius = 6, style }: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className={s.block} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

/** A chart-shaped placeholder: title line, then a plot area. */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: 10 }}>
      <Skeleton width="38%" height={14} />
      <Skeleton height={height} radius={10} />
    </div>
  );
}
