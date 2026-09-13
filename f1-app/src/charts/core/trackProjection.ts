// Projects raw position fixes (OpenF1 x/y, decimetres, y up) into an SVG
// viewport, and turns index ranges of the path into coloured runs. Shared by
// every track-shaped drawing so the outline is identical wherever it appears.

export interface XY { x: number; y: number }

export const TRACK_VIEW_W = 800;

export interface Projection {
  viewW: number;
  viewH: number;
  project: (p: XY) => XY;
  points: XY[];          // projected, zero-fixes removed
  indexMap: number[];    // projected index → original index
}

/** Drop (0,0) fixes (missing data), fit to TRACK_VIEW_W wide, flip y. */
export function projectTrack(path: XY[], minPoints = 20): Projection | null {
  const keep: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p && p.x != null && p.y != null && (p.x !== 0 || p.y !== 0)) keep.push(i);
  }
  if (keep.length < minPoints) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const i of keep) {
    const p = path[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const viewW = TRACK_VIEW_W;
  const viewH = Math.round(viewW * (h / w));
  const project = (p: XY): XY => ({ x: ((p.x - minX) / w) * viewW, y: viewH - ((p.y - minY) / h) * viewH });
  return { viewW, viewH, project, points: keep.map(i => project(path[i])), indexMap: keep };
}

export function pathFrom(pts: XY[]): string {
  if (!pts.length) return "";
  return "M " + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
}

/** Projected points for an inclusive original-index range [from, to]. */
export function slicePath(proj: Projection, path: XY[], from: number, to: number): XY[] {
  const out: XY[] = [];
  for (let i = Math.max(0, from); i <= Math.min(path.length - 1, to); i++) {
    const p = path[i];
    if (p && (p.x !== 0 || p.y !== 0)) out.push(proj.project(p));
  }
  return out;
}
