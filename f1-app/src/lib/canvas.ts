/** Initialize a HiDPI canvas and return context + CSS dimensions */
export function initCanvas(
  cv: HTMLCanvasElement,
  wrap: HTMLElement,
  cssH: number,
): { ctx: CanvasRenderingContext2D; W: number; H: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  cv.width = cssW * dpr;
  cv.height = cssH * dpr;
  cv.style.width = cssW + "px";
  cv.style.height = cssH + "px";
  const ctx = cv.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return { ctx, W: cssW, H: cssH, dpr };
}

/** Get canvas 2D context with transform reset and clear */
export function getCtx(cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; W: number; H: number } {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.width / dpr;
  const H = cv.height / dpr;
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
