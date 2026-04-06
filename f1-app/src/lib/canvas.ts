import { M } from "./styles";

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

/** Draw openf1ow.com watermark in bottom-right corner */
export function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save();
  ctx.font = `bold 9px ${M}`;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.textAlign = "right";
  ctx.fillText("openf1ow.com", W - 8, H - 6);
  ctx.restore();
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
