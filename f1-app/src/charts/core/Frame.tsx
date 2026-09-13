// The responsive SVG frame every primitive draws into. Owns the
// ResizeObserver, the margins (adaptive to width), the axes and grid, the
// optional shaded x-bands (safety car, red flag, rain) and the crosshair. The
// primitive supplies scales' domains and a render function for its marks.

import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { linear, ticks as niceTicks, type Linear } from "./scales.ts";
import s from "./Frame.module.css";

export interface Margin { top: number; right: number; bottom: number; left: number }

export interface Band { from: number; to: number; color?: string; label?: string }

export interface FrameScales {
  x: Linear;
  y: Linear;
  width: number;
  height: number;
  innerW: number;
  innerH: number;
  margin: Margin;
}

export interface AxisSpec {
  domain: [number, number];
  /** Explicit ticks; else nice ticks are generated. Labels may be supplied per tick. */
  ticks?: { value: number; label?: string }[];
  targetTicks?: number;
  format?: (v: number) => string;
  label?: string;
  invert?: boolean;          // y grows downwards in value (positions: 1 at top)
  zeroLine?: "reference" | "plain" | false;
  zeroLabel?: string;        // e.g. "leader"
  grid?: boolean;
}

export interface FrameProps {
  height: number;
  x: AxisSpec;
  y: AxisSpec;
  bands?: Band[];            // x-ranges shaded behind the marks
  crosshairX?: number | null;   // data x for the vertical crosshair
  onPointerX?: (dataX: number | null, e: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: () => void;
  onPointerDown?: (dataX: number, e: PointerEvent<SVGSVGElement>) => void;
  margin?: Partial<Margin>;
  ariaLabel?: string;
  children: (sc: FrameScales) => ReactNode;
  overlay?: (sc: FrameScales) => ReactNode;   // drawn above marks (hover dots, labels)
  className?: string;
}

export function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        setWidth(prev => (Math.abs(prev - w) < 0.5 ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function adaptiveMargin(width: number, leftHint = 52, bottomHint = 34): Margin {
  const narrow = width < 380, mid = width < 600;
  return {
    top: 14,
    right: narrow ? 10 : 16,
    bottom: bottomHint,
    left: narrow ? Math.min(leftHint, 34) : mid ? Math.min(leftHint, 44) : leftHint,
  };
}

export default function Frame({
  height, x, y, bands, crosshairX, onPointerX, onPointerLeave, onPointerDown, margin: marginIn, ariaLabel, children, overlay, className,
}: FrameProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const margin = useMemo(() => ({ ...adaptiveMargin(width), ...marginIn }), [width, marginIn]);

  const sc = useMemo<FrameScales | null>(() => {
    if (width <= 0) return null;
    const innerW = Math.max(20, width - margin.left - margin.right);
    const innerH = Math.max(20, height - margin.top - margin.bottom);
    const yRange: [number, number] = y.invert ? [margin.top, margin.top + innerH] : [margin.top + innerH, margin.top];
    return {
      x: linear(x.domain, [margin.left, margin.left + innerW]),
      y: linear(y.domain, yRange),
      width, height, innerW, innerH, margin,
    };
  }, [width, height, margin, x.domain, y.domain, y.invert]);

  const xTicks = useMemo<{ value: number; label?: string }[]>(() => x.ticks ?? niceTicks(x.domain[0], x.domain[1], x.targetTicks ?? (width < 480 ? 4 : 8)).map(v => ({ value: v })), [x.ticks, x.domain, x.targetTicks, width]);
  const yTicks = useMemo<{ value: number; label?: string }[]>(() => y.ticks ?? niceTicks(y.domain[0], y.domain[1], y.targetTicks ?? 5).map(v => ({ value: v })), [y.ticks, y.domain, y.targetTicks]);

  const toDataX = (e: PointerEvent<SVGSVGElement>): number | null => {
    if (!sc) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * sc.width;
    if (px < sc.margin.left - 10 || px > sc.width - sc.margin.right + 10) return null;
    return sc.x.invert(Math.max(sc.margin.left, Math.min(sc.margin.left + sc.innerW, px)));
  };

  if (!sc) return <div ref={ref} className={className} style={{ width: "100%", height }} />;

  const fmtX = x.format ?? (v => String(v));
  const fmtY = y.format ?? (v => String(v));
  const zero = y.zeroLine !== false && y.domain[0] <= 0 && y.domain[1] >= 0 ? sc.y(0) : null;

  return (
    <div ref={ref} className={[s.wrap, className].filter(Boolean).join(" ")} style={{ width: "100%" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${sc.width} ${sc.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className={s.svg}
        onPointerMove={onPointerX ? e => onPointerX(toDataX(e), e) : undefined}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown ? e => { const dx = toDataX(e); if (dx != null) onPointerDown(dx, e); } : undefined}
        style={{ touchAction: "pan-y" }}
      >
        {/* bands */}
        {bands?.map((b, i) => {
          const x0 = sc.x(Math.max(b.from, x.domain[0]));
          const x1 = sc.x(Math.min(b.to, x.domain[1]));
          if (!(x1 > x0)) return null;
          return (
            <g key={i} data-export="keep">
              <rect x={x0} y={sc.margin.top} width={x1 - x0} height={sc.innerH} fill={b.color ?? "rgba(255,255,255,0.05)"} />
              {b.label && sc.innerW > 300 && (
                <text x={(x0 + x1) / 2} y={sc.margin.top + 10} className={s.bandLabel} textAnchor="middle">{b.label}</text>
              )}
            </g>
          );
        })}

        {/* y grid + ticks */}
        {(y.grid ?? true) && yTicks.map((t, i) => {
          const yy = sc.y(t.value);
          if (yy < sc.margin.top - 1 || yy > sc.margin.top + sc.innerH + 1) return null;
          const isZero = Math.abs(t.value) < 1e-9 && y.zeroLine === "reference";
          return (
            <g key={`${i}-${t.value}`}>
              <line x1={sc.margin.left} x2={sc.margin.left + sc.innerW} y1={yy} y2={yy} className={isZero ? s.zeroRef : s.grid} />
              <text x={sc.margin.left - 7} y={yy + 3} textAnchor="end" className={isZero ? s.zeroTick : s.tick}>
                {isZero && y.zeroLabel ? y.zeroLabel : (t.label ?? fmtY(t.value))}
              </text>
            </g>
          );
        })}
        {zero != null && y.zeroLine === "plain" && (
          <line x1={sc.margin.left} x2={sc.margin.left + sc.innerW} y1={zero} y2={zero} className={s.zeroPlain} />
        )}

        {/* x ticks */}
        {xTicks.map(t => {
          const xx = sc.x(t.value);
          if (xx < sc.margin.left - 1 || xx > sc.margin.left + sc.innerW + 1) return null;
          return (
            <text key={t.value} x={xx} y={sc.height - sc.margin.bottom + 15} textAnchor="middle" className={s.tick}>
              {t.label ?? fmtX(t.value)}
            </text>
          );
        })}
        {x.label && <text x={sc.margin.left + sc.innerW / 2} y={sc.height - 4} textAnchor="middle" className={s.axisLabel}>{x.label}</text>}
        {y.label && (
          <text transform={`translate(10 ${sc.margin.top + sc.innerH / 2}) rotate(-90)`} textAnchor="middle" className={s.axisLabel}>{y.label}</text>
        )}

        {/* axis line */}
        <line x1={sc.margin.left} x2={sc.margin.left + sc.innerW} y1={sc.margin.top + sc.innerH} y2={sc.margin.top + sc.innerH} className={s.axis} />

        {/* marks */}
        <g clipPath={undefined}>{children(sc)}</g>

        {/* crosshair */}
        {crosshairX != null && crosshairX >= x.domain[0] && crosshairX <= x.domain[1] && (
          <line data-export="hide" x1={sc.x(crosshairX)} x2={sc.x(crosshairX)} y1={sc.margin.top} y2={sc.margin.top + sc.innerH} className={s.crosshair} />
        )}
        {overlay?.(sc)}
      </svg>
    </div>
  );
}
