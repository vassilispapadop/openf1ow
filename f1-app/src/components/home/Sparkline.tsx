// Tiny inline sparkline (SVG, not canvas — needs no resize handling).
// Used by ConstructorPaceTile + TeammateGapTile. Lower-is-better, so the
// chart is auto-inverted (small Y values render at the top).

import { F, C } from "../../lib/styles";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  invert?: boolean;
}

export default function Sparkline({
  values,
  width = 220,
  height = 56,
  stroke = C.text,
  fill,
  invert = false,
}: Props) {
  if (!values.length) {
    return (
      <div style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: C.textFaint,
        fontFamily: F,
      }}>
        no data yet
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(1, values.length - 1)) * innerW;
    const norm = (v - min) / range;
    const y = padY + (invert ? norm : 1 - norm) * innerH;
    return [x, y] as const;
  });

  const path = "M " + points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ");
  const area = path + ` L ${points[points.length - 1][0].toFixed(1)},${height} L ${points[0][0].toFixed(1)},${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
      {fill && <path d={area} fill={fill} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}
