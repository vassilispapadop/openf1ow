// Shared SVG line-chart helpers for the season charts. Each of these was
// copy-pasted into every evolution chart before; a new chart makes that a
// fourth copy, so they live here now.

export interface Pt { x: number; y: number }

/** Catmull-Rom-ish smoothing through the points, as an SVG path. Falls back to
 *  a straight line for one or two points. */
export function smoothPath(points: Pt[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }
  const t = 0.18;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Round a raw axis step up to a 1/2/5 × 10ⁿ value. */
export function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/** Ticks from 0 up to `yRange` — for axes that start at the leader. */
export function gridYTicks(yRange: number, targetTicks = 5): number[] {
  const step = niceStep(yRange / targetTicks);
  const ticks: number[] = [];
  for (let g = 0; g <= yRange + step * 0.0001; g += step) ticks.push(+g.toFixed(4));
  return ticks;
}

/** Ticks spanning a signed range, always including zero — for axes where a
 *  series can sit either side of the reference. */
export function signedYTicks(min: number, max: number, targetTicks = 6): number[] {
  const step = niceStep((max - min) / targetTicks);
  const ticks: number[] = [];
  for (let g = Math.ceil(min / step) * step; g <= max + step * 0.0001; g += step) {
    ticks.push(+g.toFixed(4));
  }
  if (!ticks.some(t => Math.abs(t) < 1e-9)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

/** Circuit name trimmed for an X-axis tick. */
export function shortMeetingName(meetingName: string, maxLen = 10): string {
  const name = meetingName.replace(/\s+(Grand Prix|GP)$/i, "").trim();
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}
