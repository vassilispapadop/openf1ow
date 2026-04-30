// Render-prop pattern (not children): drawing runs as a useEffect on the
// *consumer's* state, so the canvas ref needs to flow down to the chart.

import type { CSSProperties } from "react";
import { useResponsiveCanvas, adaptiveMargins, type ChartMargins } from "../../lib/useResponsiveCanvas";

interface RenderArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  margins: ChartMargins;
}

interface Props {
  height: number;
  className?: string;
  style?: CSSProperties;
  /** Optional second canvas overlay for hover/tooltip — gets its own ref */
  withOverlay?: boolean;
  render: (args: RenderArgs & { overlayRef?: React.RefObject<HTMLCanvasElement | null> }) => React.ReactNode;
}

export default function ChartContainer({ height, className, style, withOverlay, render }: Props) {
  const { wrapRef, canvasRef, width } = useResponsiveCanvas(height);
  const overlay = useResponsiveCanvas(height);
  const margins = adaptiveMargins(width);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: "relative", width: "100%", touchAction: "pan-y", ...style }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {withOverlay && (
        <canvas
          ref={overlay.canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "auto",
            // Overlay shares wrap width via its own ResizeObserver; keep it stacked
            display: "block",
          }}
        />
      )}
      {render({
        canvasRef,
        width,
        height,
        margins,
        overlayRef: withOverlay ? overlay.canvasRef : undefined,
      })}
    </div>
  );
}
