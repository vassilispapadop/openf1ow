// The telemetry stack: speed, throttle, brake, gear and DRS against
// distance, one panel each on a shared crosshair, plus the time delta to the
// fastest lap when two or more laps are compared. Six LineCharts, one axis
// each — never a dual axis — with the legend on the speed panel only.

import { useMemo, useState } from "react";
import LineChart, { type Series, type Mark } from "../../charts/LineChart";
import type { Band } from "../../charts/core/Frame";
import { fmt } from "../../charts/core/scales";
import { DRS_OPEN, DRS_ELIGIBLE } from "../../lib/constants";
import { deltaToFastest, spansWhere, type LapTrace } from "../../engine/telemetry/compare.ts";
import type { ClipEvent } from "../../engine/telemetry/clipping.ts";

const km = (d: number) => (d >= 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m");

export default function TelemetryStack({ traces, clippingEvents, hoverX: hoverXIn, onHoverX }: {
  traces: LapTrace[];
  clippingEvents?: ClipEvent[];
  hoverX?: number | null;
  onHoverX?: (x: number | null) => void;
}) {
  const [hoverLocal, setHoverLocal] = useState<number | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hoverX = hoverXIn ?? hoverLocal;
  const setHoverX = onHoverX ?? setHoverLocal;

  const usable = useMemo(() => traces.filter(t => t.data.length >= 2), [traces]);
  const maxDist = useMemo(() => Math.max(1, ...usable.map(t => t.data[t.data.length - 1].distance ?? 0)), [usable]);

  const mk = (get: (s: LapTrace["data"][number]) => number | null | undefined): Series[] => usable.map(t => ({
    key: t.key, label: t.label, color: "#" + t.color,
    points: t.data.map(s => ({ x: s.distance ?? 0, y: get(s) as number })).filter(p => Number.isFinite(p.y)),
  }));

  const speed = useMemo(() => mk(s => s.speed), [usable]);
  const throttle = useMemo(() => mk(s => s.throttle), [usable]);
  const brake = useMemo(() => mk(s => (s.brake ? 1 : 0)), [usable]);
  const gear = useMemo(() => mk(s => s.n_gear), [usable]);
  const drs = useMemo(() => mk(s => (DRS_OPEN.includes(s.drs as number) ? 1 : s.drs === DRS_ELIGIBLE ? 0.5 : 0)), [usable]);
  const delta = useMemo(() => deltaToFastest(usable), [usable]);
  const deltaSeries: Series[] = useMemo(() => (delta ? delta.perTrace.map(pt => {
    const t = usable.find(x => x.key === pt.key)!;
    return { key: t.key, label: t.label, color: "#" + t.color, points: delta.grid.map((d, i) => ({ x: d, y: pt.values[i] })) };
  }) : []), [delta, usable]);

  // DRS-open spans of the reference (first) lap shade the speed panel.
  const drsBands: Band[] = useMemo(() => (usable[0]
    ? spansWhere(usable[0].data, s => DRS_OPEN.includes(s.drs as number)).filter(sp => sp.to - sp.from > 50).map(sp => ({ from: sp.from, to: sp.to, color: "rgba(46,213,115,0.07)", label: "DRS" }))
    : []), [usable]);
  const clipMarks: Mark[] = useMemo(() => (clippingEvents ?? []).map(e => ({ x: e.distance, label: "clip", kind: "flag" as const, color: (e as ClipEvent & { color?: string }).color ? "#" + (e as ClipEvent & { color?: string }).color : "var(--warn)" })), [clippingEvents]);

  if (!usable.length) return null;
  const shared = {
    curve: "linear" as const, endDots: false, hoverX, onHoverX: setHoverX, hovered, onHover: setHovered, hidden, onHiddenChange: setHidden,
    legend: false as const, x: { domain: [0, maxDist] as [number, number], format: km, targetTicks: 8 },
  };
  const tipTitle = (d: number) => `${km(d)} into the lap`;

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <LineChart {...shared} series={speed} height={230} y={{ format: v => String(Math.round(v)), targetTicks: 5, label: "km/h" }} bands={drsBands} marks={clipMarks}
        format={v => Math.round(v) + " km/h"} tipTitle={tipTitle} legend={{ columns: Math.min(3, usable.length), compact: true, hint: usable.length > 1 }} ariaLabel="Speed against distance" />
      <LineChart {...shared} series={throttle} height={110} y={{ domain: [0, 100], ticks: [{ value: 0 }, { value: 50 }, { value: 100 }], format: v => String(v), label: "Thr %" }}
        format={v => Math.round(v) + " %"} tipTitle={tipTitle} rankTooltip={false} ariaLabel="Throttle against distance" />
      <LineChart {...shared} curve="step" series={brake} height={70} y={{ domain: [0, 1.15], ticks: [{ value: 0, label: "off" }, { value: 1, label: "on" }], format: v => (v >= 1 ? "on" : "off"), label: "Brake" }}
        format={v => (v >= 1 ? "on" : "off")} tipTitle={tipTitle} rankTooltip={false} ariaLabel="Brake against distance" />
      <LineChart {...shared} curve="step" series={gear} height={110} y={{ domain: [0.5, 8.5], ticks: [{ value: 2 }, { value: 4 }, { value: 6 }, { value: 8 }], format: v => String(Math.round(v)), label: "Gear" }}
        format={v => "gear " + Math.round(v)} tipTitle={tipTitle} rankTooltip={false} ariaLabel="Gear against distance" />
      <LineChart {...shared} curve="step" series={drs} height={80} y={{ domain: [0, 1.15], ticks: [{ value: 0, label: "off" }, { value: 1, label: "open" }], format: v => (v >= 1 ? "open" : v > 0 ? "elig" : "off"), label: "DRS" }}
        format={v => (v >= 1 ? "open" : v > 0 ? "eligible" : "off")} tipTitle={tipTitle} rankTooltip={false} ariaLabel="DRS against distance" x={{ ...shared.x, label: delta ? undefined : "Distance" }} />
      {delta && (
        <LineChart {...shared} series={deltaSeries} height={190} y={{ format: v => fmt.signedSec(v, 1), includeZero: true, zeroLine: "reference", zeroLabel: "fastest", targetTicks: 5, label: "Δ s" }}
          format={v => "+" + v.toFixed(3) + " s"} tipTitle={d => `${km(d)} · time behind the fastest lap here (smoothed over ~${Math.round(5 * maxDist / 400)} m)`} x={{ ...shared.x, label: "Distance" }} ariaLabel="Time delta to the fastest lap against distance" />
      )}
    </div>
  );
}
