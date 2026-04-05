import { F, M } from "./styles";

const BRAND_H = 36;
const BRAND_PAD = 14;

/** Composite branding onto a canvas snapshot and return as Blob */
export async function captureCanvas(
  canvas: HTMLCanvasElement,
  meta?: string,
): Promise<Blob> {
  const dpr = window.devicePixelRatio || 1;
  const srcW = canvas.width / dpr;
  const srcH = canvas.height / dpr;

  // Create a new canvas with branding bar at bottom
  const out = document.createElement("canvas");
  const outW = srcW;
  const outH = srcH + BRAND_H;
  out.width = outW * 2; // always render at 2x for crisp sharing
  out.height = outH * 2;
  const ctx = out.getContext("2d")!;
  ctx.scale(2, 2);

  // Draw the source chart
  ctx.drawImage(canvas, 0, 0, srcW, srcH);

  // Branding bar background
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, srcH, outW, BRAND_H);

  // Red accent line
  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, srcH, outW, 1);

  // Logo: "Open" + "F1" + "ow"
  ctx.font = `800 13px ${F}`;
  ctx.textAlign = "left";
  const logoY = srcH + BRAND_H / 2 + 4;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Open", BRAND_PAD, logoY);
  const openW = ctx.measureText("Open").width;
  ctx.fillStyle = "rgba(225,6,0,0.7)";
  ctx.fillText("F1", BRAND_PAD + openW, logoY);
  const f1W = ctx.measureText("F1").width;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("ow", BRAND_PAD + openW + f1W, logoY);

  // URL
  ctx.font = `500 9px ${M}`;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.textAlign = "right";
  ctx.fillText("openf1ow.com", outW - BRAND_PAD, logoY);

  // Metadata (race/session) centered
  if (meta) {
    ctx.font = `600 9px ${F}`;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "center";
    ctx.fillText(meta, outW / 2, logoY);
  }

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

/** Capture multiple canvases stacked vertically (e.g. Chart + DeltaChart) */
export async function captureCanvasStack(
  canvases: HTMLCanvasElement[],
  meta?: string,
): Promise<Blob> {
  const dpr = window.devicePixelRatio || 1;
  const srcW = Math.max(...canvases.map(c => c.width / dpr));
  let totalH = 0;
  canvases.forEach(c => { totalH += c.height / dpr; });

  const out = document.createElement("canvas");
  const outW = srcW;
  const outH = totalH + BRAND_H;
  out.width = outW * 2;
  out.height = outH * 2;
  const ctx = out.getContext("2d")!;
  ctx.scale(2, 2);

  // Draw source canvases stacked
  let yOff = 0;
  canvases.forEach(c => {
    const w = c.width / dpr;
    const h = c.height / dpr;
    ctx.drawImage(c, 0, yOff, w, h);
    yOff += h;
  });

  // Branding bar
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, totalH, outW, BRAND_H);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, totalH, outW, 1);

  ctx.font = `800 13px ${F}`;
  ctx.textAlign = "left";
  const logoY = totalH + BRAND_H / 2 + 4;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Open", BRAND_PAD, logoY);
  const openW = ctx.measureText("Open").width;
  ctx.fillStyle = "rgba(225,6,0,0.7)";
  ctx.fillText("F1", BRAND_PAD + openW, logoY);
  const f1W = ctx.measureText("F1").width;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("ow", BRAND_PAD + openW + f1W, logoY);

  ctx.font = `500 9px ${M}`;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.textAlign = "right";
  ctx.fillText("openf1ow.com", outW - BRAND_PAD, logoY);

  if (meta) {
    ctx.font = `600 9px ${F}`;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "center";
    ctx.fillText(meta, outW / 2, logoY);
  }

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

/** Copy blob to clipboard as PNG */
export async function copyToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Download blob as PNG file */
export function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
