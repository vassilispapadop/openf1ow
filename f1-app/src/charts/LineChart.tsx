// LineChart: many series on a shared x, with the interaction the season
// engines had — a crosshair snapping to the nearest x, a ranked tooltip of
// every series at that x, a legend that focuses on hover and hides on click,
// optional shaded bands and a signed y axis with a reference zero. It is the
// one implementation behind the five season charts, the lap-evolution chart
// and the telemetry panels.

import { useMemo, useState, useCallback, type ReactNode } from "react";
import Frame, { type Band, type AxisSpec } from "./core/Frame.tsx";
import { pathFor, nearestIndex, extent, pad, type Curve } from "./core/scales.ts";
import { seriesVisual, VISUAL, type SeriesStateInput } from "./core/useSeriesState.ts";
import { Legend, useTooltip, TipTitle, TipRow } from "../ui";
import s from "./LineChart.module.css";

export interface SeriesPoint { x: number; y: number; meta?: unknown }

export interface Series {
  key: string;
  label: string;
  color: string;
  dash?: boolean;
  points: SeriesPoint[];         // sorted by x
  /** Sort key for legend / ranking (default: last y). */
  rank?: number;
}

export interface Mark { x: number; y?: number; label?: string; color?: string; kind?: "dot" | "flag" }

export interface LineChartProps {
  series: Series[];
  height?: number;
  x: Omit<AxisSpec, "domain"> & { domain?: [number, number] };
  y: Omit<AxisSpec, "domain"> & { domain?: [number, number]; padFrac?: number; includeZero?: boolean };
  curve?: Curve;
  showDots?: boolean;            // dots at every data point on focused series
  endDots?: boolean;             // a dot at the last point of each series
  endLabels?: boolean;           // series label at the line end (≤ 4 visible series)
  bands?: Band[];
  marks?: Mark[];
  /** Tooltip header for a hovered x (e.g. "Round 3 · Suzuka"). */
  tipTitle?: (x: number) => ReactNode;
  /** Format a y value for tooltip / legend. */
  format?: (y: number, seriesKey: string) => string;
  /** Series in focus by default (others dim); null = none. */
  focus?: ReadonlySet<string> | null;
  hidden?: ReadonlySet<string>;
  onHiddenChange?: (next: Set<string>) => void;
  hovered?: string | null;
  onHover?: (key: string | null) => void;
  /** When given, a legend click selects (toggles focus) instead of hiding; alt-click still isolates. */
  onSelect?: (key: string) => void;
  /** Controlled hover x (for synced charts); else internal. */
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
  legend?: boolean | { columns?: number; compact?: boolean; hint?: boolean };
  rankTooltip?: boolean;         // rank all series at hover x (default true)
  ariaLabel?: string;
  className?: string;
  children?: (sc: import("./core/Frame.tsx").FrameScales) => ReactNode;   // extra marks
}

export default function LineChart({
  series, height = 360, x, y, curve = "monotone", showDots, endDots = true, endLabels, bands, marks, tipTitle, format,
  focus, hidden: hiddenIn, onHiddenChange, hovered: hoveredIn, onHover, onSelect, hoverX: hoverXIn, onHoverX, legend = true, rankTooltip = true,
  ariaLabel, className, children,
}: LineChartProps) {
  const [hiddenLocal, setHiddenLocal] = useState<Set<string>>(new Set());
  const [hoveredLocal, setHoveredLocal] = useState<string | null>(null);
  const [hoverXLocal, setHoverXLocal] = useState<number | null>(null);
  const hidden = hiddenIn ?? hiddenLocal;
  const hovered = hoveredIn ?? hoveredLocal;
  const hoverX = hoverXIn ?? hoverXLocal;
  const setHidden = onHiddenChange ?? setHiddenLocal;
  const setHovered = onHover ?? setHoveredLocal;
  const setHoverX = onHoverX ?? setHoverXLocal;
  const tip = useTooltip();

  const fmt = format ?? ((v: number) => v.toFixed(3));
  const st: SeriesStateInput = { hidden, hovered, focus };

  // Domains from visible series unless given.
  const visible = useMemo(() => series.filter(sr => !hidden.has(sr.key)), [series, hidden]);
  const xDomain = useMemo<[number, number]>(() => {
    if (x.domain) return x.domain;
    const e = extent(series.flatMap(sr => sr.points.map(p => p.x)));
    return e ?? [0, 1];
  }, [x.domain, series]);
  const yDomain = useMemo<[number, number]>(() => {
    if (y.domain) return y.domain;
    const pool = (visible.length ? visible : series).flatMap(sr => sr.points.map(p => p.y));
    let e = extent(pool) ?? [0, 1];
    if (y.includeZero) e = [Math.min(0, e[0]), Math.max(0, e[1])];
    return pad(e, y.padFrac ?? 0.08);
  }, [y.domain, y.includeZero, y.padFrac, visible, series]);

  // All distinct x values for snapping.
  const xs = useMemo(() => Array.from(new Set(series.flatMap(sr => sr.points.map(p => p.x)))).sort((a, b) => a - b), [series]);
  const snappedX = useMemo(() => {
    if (hoverX == null || !xs.length) return null;
    return xs[nearestIndex(xs, v => v, hoverX)];
  }, [hoverX, xs]);

  // Ranked rows at the snapped x.
  const rows = useMemo(() => {
    if (snappedX == null) return [];
    const out: { sr: Series; p: SeriesPoint }[] = [];
    for (const sr of series) {
      const p = sr.points.find(pt => pt.x === snappedX);
      if (p) out.push({ sr, p });
    }
    out.sort((a, b) => (y.invert ? a.p.y - b.p.y : a.p.y - b.p.y));
    return out;
  }, [snappedX, series, y.invert]);

  const onPointerX = useCallback((dx: number | null, e: React.PointerEvent<SVGSVGElement>) => {
    setHoverX(dx);
    if (dx == null || !rankTooltip) { tip.hide(); return; }
    const sx = xs.length ? xs[nearestIndex(xs, v => v, dx)] : null;
    if (sx == null) { tip.hide(); return; }
    const rs: { sr: Series; p: SeriesPoint }[] = [];
    for (const sr of series) { const p = sr.points.find(pt => pt.x === sx); if (p) rs.push({ sr, p }); }
    rs.sort((a, b) => a.p.y - b.p.y);
    tip.show(e, (
      <>
        <TipTitle>{tipTitle ? tipTitle(sx) : (x.format ? x.format(sx) : String(sx))}</TipTitle>
        {rs.slice(0, 22).map(({ sr, p }, i) => (
          <TipRow key={sr.key} color={sr.color} label={<>{rankTooltip && <span className={s.rank}>{i + 1}</span>}{sr.label}</>} value={fmt(p.y, sr.key)} muted={hidden.has(sr.key)} />
        ))}
      </>
    ));
  }, [setHoverX, rankTooltip, xs, series, tipTitle, x.format, fmt, hidden, tip]);

  const onLeave = useCallback(() => { setHoverX(null); tip.hide(); }, [setHoverX, tip]);

  const toggleHidden = useCallback((key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHidden(next);
  }, [hidden, setHidden]);
  const isolate = useCallback((key: string) => {
    const others = series.map(sr => sr.key).filter(k => k !== key);
    const alreadyIsolated = others.every(k => hidden.has(k)) && !hidden.has(key);
    setHidden(alreadyIsolated ? new Set() : new Set(others));
  }, [series, hidden, setHidden]);

  const legendItems = useMemo(() => {
    const at = snappedX;
    return series.map(sr => {
      const p = at != null ? sr.points.find(pt => pt.x === at) : sr.points[sr.points.length - 1];
      return { key: sr.key, label: sr.label, color: sr.color, dash: sr.dash, value: p ? fmt(p.y, sr.key) : undefined };
    });
  }, [series, snappedX, fmt]);

  const legendOpts = typeof legend === "object" ? legend : {};
  const visibleFocused = visible.filter(sr => seriesVisual(sr.key, st) !== "dim");

  return (
    <div className={[s.root, className].filter(Boolean).join(" ")}>
      <Frame
        height={height}
        x={{ ...x, domain: xDomain }}
        y={{ ...y, domain: yDomain }}
        bands={bands}
        crosshairX={snappedX}
        onPointerX={onPointerX}
        onPointerLeave={onLeave}
        ariaLabel={ariaLabel}
        overlay={sc => (
          <>
            {endDots && series.map(sr => {
              const v = seriesVisual(sr.key, st);
              if (v === "hidden" || !sr.points.length) return null;
              const last = sr.points[sr.points.length - 1];
              const cx = sc.x(last.x), cy = sc.y(last.y);
              const dim = v === "dim";
              return (
                <g key={sr.key} opacity={dim ? 0.35 : 1}>
                  <circle cx={cx} cy={cy} r={v === "focus" ? 4.5 : 3} fill={sr.color} stroke="var(--chart-halo)" strokeWidth={1.5} />
                  {endLabels && !dim && visibleFocused.length <= 4 && (
                    <text x={cx + 7} y={cy + 3.5} className={s.endLabel}>{sr.label}</text>
                  )}
                </g>
              );
            })}
            {snappedX != null && rows.map(({ sr, p }) => {
              const v = seriesVisual(sr.key, st);
              if (v === "hidden") return null;
              return (
                <circle key={"h" + sr.key} data-export="hide" cx={sc.x(p.x)} cy={sc.y(p.y)} r={v === "dim" ? 2 : 3.5}
                  fill={sr.color} stroke="var(--chart-halo)" strokeWidth={1} opacity={v === "dim" ? 0.5 : 1} pointerEvents="none" />
              );
            })}
          </>
        )}
      >
        {sc => (
          <>
            <defs>
              <clipPath id="lc-clip">
                <rect x={sc.margin.left} y={sc.margin.top - 3} width={sc.innerW} height={sc.innerH + 6} />
              </clipPath>
            </defs>
            <g clipPath="url(#lc-clip)">
              {/* dim series first, focused on top */}
              {[...series].sort((a, b) => {
                const va = seriesVisual(a.key, st), vb = seriesVisual(b.key, st);
                return (va === "focus" ? 1 : 0) - (vb === "focus" ? 1 : 0);
              }).map(sr => {
                const v = seriesVisual(sr.key, st);
                if (v === "hidden") return null;
                const vis = VISUAL[v];
                const pts = sr.points.map(p => ({ x: sc.x(p.x), y: sc.y(p.y) }));
                return (
                  <g key={sr.key}>
                    <path d={pathFor(pts, curve)} fill="none" stroke={sr.color} strokeWidth={vis.width} strokeOpacity={vis.opacity}
                      strokeDasharray={sr.dash ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
                    {(showDots || v === "focus") && pts.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={v === "focus" ? 2.2 : 1.6} fill={sr.color} opacity={vis.opacity} />
                    ))}
                  </g>
                );
              })}
            </g>
            {marks?.map((m, i) => {
              const mx = sc.x(m.x);
              const my = m.y != null ? sc.y(m.y) : sc.margin.top + sc.innerH;
              return (
                <g key={i}>
                  {m.kind === "flag"
                    ? <line x1={mx} x2={mx} y1={sc.margin.top} y2={sc.margin.top + sc.innerH} stroke={m.color ?? "var(--chart-grid-strong)"} strokeDasharray="2 3" />
                    : <circle cx={mx} cy={my} r={3} fill={m.color ?? "var(--text-mute)"} />}
                  {m.label && <text x={mx + 4} y={sc.margin.top + 10} className={s.markLabel}>{m.label}</text>}
                </g>
              );
            })}
            {children?.(sc)}
          </>
        )}
      </Frame>
      {legend !== false && (
        <Legend
          items={legendItems}
          hidden={hidden}
          hovered={hovered}
          focus={focus ?? null}
          onHover={setHovered}
          onToggle={onSelect ?? toggleHidden}
          onIsolate={isolate}
          columns={legendOpts.columns}
          compact={legendOpts.compact}
          hint={legendOpts.hint}
          clickLabel={onSelect ? "selects" : "hides"}
        />
      )}
      {tip.el}
    </div>
  );
}
