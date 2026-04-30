// Hook that turns a canvas + wrap pair into a fully-responsive surface:
// observes the wrap's width with ResizeObserver, re-runs initCanvas() on
// resize, and gives back the current CSS width so the chart code can
// recompute layout. Replaces 12+ hand-rolled refs across the analysis
// components.
//
// Usage:
//   const { wrapRef, canvasRef, width } = useResponsiveCanvas(460);
//   useEffect(() => { if (!width) return; const { ctx, W, H } = initCanvas(...); /* draw */ }, [width, ...]);

import { useEffect, useRef, useState } from "react";
import { initCanvas } from "./canvas";

export function useResponsiveCanvas(cssHeight: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    const wrap = wrapRef.current;

    // Initial measurement — synchronous so first paint has a real width
    setWidth(wrap.clientWidth);

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        // Avoid resize storms triggered by canvas itself changing layout
        setWidth(prev => (prev === w ? prev : w));
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Re-initialize canvas backing store every time width or css height changes.
  // Drawing logic stays in the consumer's effect; this hook only owns sizing.
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current || width === 0) return;
    initCanvas(canvasRef.current, wrapRef.current, cssHeight);
  }, [width, cssHeight]);

  return { wrapRef, canvasRef, width };
}

// Adaptive chart margins. Charts call this with their container width and
// get back margins that scale gracefully at narrow widths. Keeps the math
// in one place so no chart hardcodes 52/56/66 pixel margins anymore.
export interface ChartMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
  axisFont: number;
  labelFont: number;
}

export function adaptiveMargins(width: number): ChartMargins {
  if (width < 380) {
    return { left: 28, right: 8, top: 10, bottom: 22, axisFont: 9, labelFont: 9 };
  }
  if (width < 600) {
    return { left: 36, right: 12, top: 12, bottom: 26, axisFont: 10, labelFont: 10 };
  }
  return { left: 52, right: 16, top: 14, bottom: 30, axisFont: 10, labelFont: 11 };
}
