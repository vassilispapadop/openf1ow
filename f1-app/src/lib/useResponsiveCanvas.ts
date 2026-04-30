// Hook: ResizeObserver-driven HiDPI canvas. The consumer attaches both
// refs and reads `width` to drive its draw effect.
//
//   const { wrapRef, canvasRef, width } = useResponsiveCanvas(460);
//   useEffect(() => { /* draw using width */ }, [width, ...]);

import { useEffect, useRef, useState } from "react";
import { initCanvas } from "./canvas";

export function useResponsiveCanvas(cssHeight: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    const wrap = wrapRef.current;
    setWidth(wrap.clientWidth);

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        // Same-width guard prevents redraw storms on canvas-induced reflow.
        setWidth(prev => (prev === w ? prev : w));
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current || width === 0) return;
    initCanvas(canvasRef.current, wrapRef.current, cssHeight);
  }, [width, cssHeight]);

  return { wrapRef, canvasRef, width };
}

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
