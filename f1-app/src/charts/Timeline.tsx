// Rows of spans and marks on a shared lap axis: stints as compound bars,
// pit stops as marks, safety cars as bands. Hover a span or mark for its
// details; the row label column stays fixed while the axis flexes.

import { type ReactNode } from "react";
import Frame, { type Band } from "./core/Frame.tsx";
import { useTooltip } from "../ui";
import s from "./Timeline.module.css";

export interface Span { from: number; to: number; color: string; label?: string; opacity?: number; tip?: ReactNode }
export interface TMark { x: number; color?: string; shape?: "pit" | "flag" | "dot"; tip?: ReactNode; dim?: boolean }
export interface TimelineRow { key: string; label: ReactNode; sub?: ReactNode; spans: Span[]; marks?: TMark[]; end?: number | null; dim?: boolean }

export interface TimelineProps {
  rows: TimelineRow[];
  xDomain: [number, number];
  bands?: Band[];
  rowHeight?: number;
  labelWidth?: number;
  xLabel?: string;
  onRowHover?: (key: string | null) => void;
  highlightKey?: string | null;
  ariaLabel?: string;
}

export default function Timeline({ rows, xDomain, bands, rowHeight = 22, labelWidth = 92, xLabel = "Lap", onRowHover, highlightKey, ariaLabel }: TimelineProps) {
  const tip = useTooltip();
  const height = rows.length * rowHeight + 36;
  return (
    <div className={s.root}>
      <div className={s.labels} style={{ width: labelWidth, paddingTop: 14 }}>
        {rows.map(r => (
          <div key={r.key} className={`${s.label} ${r.dim ? s.dim : ""} ${highlightKey === r.key ? s.hl : ""}`} style={{ height: rowHeight }}
            onMouseEnter={() => onRowHover?.(r.key)} onMouseLeave={() => onRowHover?.(null)}>
            <span className={s.labelMain}>{r.label}</span>
            {r.sub && <span className={s.labelSub}>{r.sub}</span>}
          </div>
        ))}
      </div>
      <div className={s.plot}>
        <Frame
          height={height}
          x={{ domain: xDomain, label: xLabel, format: v => String(Math.round(v)), targetTicks: 10 }}
          y={{ domain: [0, rows.length], grid: false, ticks: [], zeroLine: false, invert: true }}
          bands={bands}
          margin={{ left: 4, right: 10, top: 14, bottom: 22 }}
          ariaLabel={ariaLabel}
        >
          {sc => (
            <>
              {rows.map((r, i) => {
                const y0 = sc.y(i) + 3, h = rowHeight - 6;
                const dim = r.dim || (highlightKey != null && highlightKey !== r.key);
                return (
                  <g key={r.key} opacity={dim ? 0.35 : 1} onMouseEnter={() => onRowHover?.(r.key)} onMouseLeave={() => onRowHover?.(null)}>
                    {r.spans.map((sp, j) => {
                      const x0 = sc.x(sp.from - 0.5), x1 = sc.x(sp.to + 0.5);
                      return (
                        <g key={j} onPointerMove={e => sp.tip && tip.show(e, sp.tip)} onPointerLeave={tip.hide}>
                          <rect x={x0} y={y0} width={Math.max(1, x1 - x0 - 2)} height={h} rx={3} fill={sp.color} opacity={sp.opacity ?? 0.85} />
                          {sp.label && x1 - x0 > 28 && <text x={x0 + 5} y={y0 + h / 2 + 3.5} className={s.spanLabel}>{sp.label}</text>}
                        </g>
                      );
                    })}
                    {r.marks?.map((m, j) => {
                      const x = sc.x(m.x + 0.5);
                      return (
                        <g key={"m" + j} onPointerMove={e => m.tip && tip.show(e, m.tip)} onPointerLeave={tip.hide} opacity={m.dim ? 0.5 : 1}>
                          {m.shape === "flag"
                            ? <line x1={x} x2={x} y1={y0 - 2} y2={y0 + h + 2} stroke={m.color ?? "var(--text)"} strokeWidth={1.5} />
                            : <polygon points={`${x},${y0 - 1} ${x + 5},${y0 + h / 2} ${x},${y0 + h + 1} ${x - 5},${y0 + h / 2}`} fill={m.color ?? "var(--text)"} stroke="var(--chart-halo)" strokeWidth={1} />}
                        </g>
                      );
                    })}
                    {r.end != null && r.end < xDomain[1] && (
                      <text x={sc.x(r.end + 0.5) + 6} y={y0 + h / 2 + 3.5} className={s.endLabel}>out L{r.end}</text>
                    )}
                  </g>
                );
              })}
            </>
          )}
        </Frame>
      </div>
      {tip.el}
    </div>
  );
}
