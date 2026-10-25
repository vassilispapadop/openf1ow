// The lap-comparison workspace: the telemetry traces on the left, and on the
// right a circuit map that follows them. Hover (or touch-drag) any trace and a
// dot per lap shows where each car physically was; move over the map and the
// crosshair on every trace follows. Beneath the map, a readout gives each
// lap's speed, throttle, brake, gear and time gap at that point, and the
// section of track the cursor is in. The per-section tables sit below.

import { useMemo, useState } from "react";
import TelemetryStack from "./TelemetryStack";
import SegmentComparison, { SectionDetail } from "../session/SegmentComparison";
import SectionMap, { type MapMode } from "../session/SectionMap";
import TrackOutline from "../../charts/TrackOutline";
import Segmented from "../../ui/Segmented";
import { elapsedByDistance, elapsedAt, type LapTrace } from "../../engine/telemetry/compare.ts";
import type { ClipEvent } from "../../engine/telemetry/clipping.ts";
import { compareLapSegments, type TrackSegment } from "../../lib/lapSegments";
import { SECTION_COLORS } from "../../lib/constants";
import { sty, F } from "../../lib/styles";
import css from "./LapComparison.module.css";

interface Props {
  traces: LapTrace[];
  clippingEvents?: ClipEvent[];
}

/** Index of the last sample at or before a distance (distance is monotone). */
function indexAt(data: LapTrace["data"], d: number): number {
  let lo = 0, hi = data.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((data[mid].distance ?? 0) <= d) lo = mid; else hi = mid;
  }
  return lo;
}

/** Where a lap's car was at a distance, interpolated between its fixes. */
function positionAt(data: LapTrace["data"], d: number): { x: number; y: number } | null {
  if (data.length < 2) return null;
  const i = indexAt(data, d), a = data[i], b = data[Math.min(i + 1, data.length - 1)];
  if (a.x == null || a.y == null || b.x == null || b.y == null) return null;
  const span = (b.distance ?? 0) - (a.distance ?? 0);
  const f = span > 0 ? Math.max(0, Math.min(1, (d - (a.distance ?? 0)) / span)) : 0;
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
}

function segmentAt(segments: TrackSegment[], d: number): TrackSegment | null {
  return segments.find(s => (s.wraps ? d >= s.startDist || d < s.endDist : d >= s.startDist && d < s.endDist)) ?? null;
}

const km = (d: number) => (d >= 1000 ? (d / 1000).toFixed(2) + " km" : Math.round(d) + " m");

export default function LapComparison({ traces, clippingEvents }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [mode, setMode] = useState<MapMode>("gain");
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const cmp = useMemo(() => (traces.length >= 2 ? compareLapSegments(traces) : null), [traces]);
  const elapsed = useMemo(() => traces.map(t => elapsedByDistance(t.data)), [traces]);

  // The circuit outline: the comparison's reference line, or — for a single
  // lap, or when the laps can't be segmented — the first lap's own fixes.
  const own = useMemo(() => {
    if (cmp?.path.length) return null;
    const t = traces.find(x => x.data.some(p => p.x != null && (p.x !== 0 || p.y !== 0)));
    return t ? t.data.map(p => ({ x: p.x ?? 0, y: p.y ?? 0, distance: p.distance ?? 0 })) : null;
  }, [cmp, traces]);
  const path = cmp?.path.length ? cmp.path : own;

  const trackLen = cmp?.trackDistance ?? 0;
  const indexToDist = (i: number): number | null => {
    if (cmp?.path.length) return (i / (cmp.path.length - 1)) * trackLen;
    return own?.[i]?.distance ?? null;
  };

  const markers = useMemo(() => (hoverX == null ? [] : traces.flatMap(t => {
    const p = positionAt(t.data, hoverX);
    return p ? [{ ...p, color: "#" + t.color }] : [];
  })), [hoverX, traces]);

  const rows = useMemo(() => {
    if (hoverX == null) return null;
    const at = traces.map((t, i) => {
      const s = t.data[indexAt(t.data, hoverX)];
      return { t, s, time: elapsedAt(elapsed[i], hoverX) };
    });
    const best = Math.min(...at.map(r => r.time));
    return at.map(r => ({ ...r, gap: r.time - best }));
  }, [hoverX, traces, elapsed]);

  const active = hoverSeg ?? pinned;
  const here = hoverX != null && cmp ? segmentAt(cmp.segments, hoverX) : null;
  const maxSpread = cmp ? Math.max(0.02, ...cmp.segments.map(s => {
    const ts = s.timings.map(t => t.time);
    return Math.max(...ts) - Math.min(...ts);
  })) : 0.1;

  const onPointerIndex = (i: number | null) => {
    if (i == null) { setHoverX(null); return; }
    setHoverX(indexToDist(i));
  };

  const selectSeg = (i: number) => setPinned(p => (p === i ? null : i));

  return (
    <div style={{ fontFamily: F }}>
      <div className={css.workspace}>
        <div style={{ minWidth: 0 }}>
          <TelemetryStack traces={traces} clippingEvents={clippingEvents} hoverX={hoverX} onHoverX={setHoverX} />
        </div>

        <aside className={css.side} aria-label="Circuit map">
          {path && (
            <div className={css.panel}>
              {cmp && (
                <div style={{ marginBottom: 10 }}>
                  <Segmented
                    size="sm"
                    variant="inverted"
                    options={[{ key: "gain", label: "Who gained" }, { key: "kind", label: "Corner / straight" }]}
                    value={mode}
                    onChange={(k: string) => setMode(k as MapMode)}
                  />
                </div>
              )}
              {cmp ? (
                <SectionMap
                  path={cmp.path}
                  segments={cmp.segments}
                  mode={mode}
                  height={380}
                  active={active}
                  onHover={setHoverSeg}
                  onSelect={selectSeg}
                  drivers={cmp.totals.map(t => ({ label: t.label, color: t.color }))}
                  maxSpread={maxSpread}
                  markers={markers}
                  onPointerIndex={onPointerIndex}
                />
              ) : (
                <TrackOutline
                  path={path}
                  runs={[{ from: 0, to: path.length - 1, color: "var(--text-mute)", opacity: 0.6, width: 4 }]}
                  height={380}
                  ariaLabel="Circuit map"
                  markers={markers}
                  onPointerIndex={onPointerIndex}
                />
              )}
            </div>
          )}

          <div className={css.panel} aria-live="off">
            <div className={css.readoutHead}>
              {rows && hoverX != null ? (
                <>
                  <span style={{ ...sty.mono, color: 'var(--text)', fontWeight: 700 }}>{km(hoverX)}</span>
                  {here && (
                    <span>
                      <span style={{ color: SECTION_COLORS[here.kind], fontWeight: 700 }}>{here.name}</span>
                      {" "}{here.kind === "curve" ? "fast curve" : here.kind}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--text-mute)' }}>Hover the traces or the map to read every lap at one point.</span>
              )}
            </div>
            {rows && (
              <>
                <div className={`${css.readoutRow} ${css.cols}`}>
                  <span /><span>Lap</span>
                  <span style={{ textAlign: "right" }}>km/h</span>
                  <span style={{ textAlign: "right" }}>Thr</span>
                  <span style={{ textAlign: "right" }}>Brk</span>
                  <span className={css.hideNarrow} style={{ textAlign: "right" }}>Gear</span>
                  <span className={css.hideNarrow} style={{ textAlign: "right" }}>Gap</span>
                </div>
                {rows.map(r => (
                  <div key={r.t.key} className={css.readoutRow}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#" + r.t.color, alignSelf: "center" }} />
                    <span style={{ color: 'var(--text)', fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.t.label}</span>
                    <span style={{ ...sty.mono, textAlign: "right", color: 'var(--text)' }}>{r.s.speed != null ? Math.round(r.s.speed) : "—"}</span>
                    <span style={{ ...sty.mono, textAlign: "right", color: 'var(--text-dim)' }}>{r.s.throttle != null && r.s.throttle <= 100 ? Math.round(r.s.throttle) : "—"}</span>
                    <span style={{ ...sty.mono, textAlign: "right", color: r.s.brake ? 'var(--neg)' : 'var(--text-faint)' }}>{r.s.brake ? "on" : "off"}</span>
                    <span className={css.hideNarrow} style={{ ...sty.mono, textAlign: "right", color: 'var(--text-dim)' }}>{r.s.n_gear ?? "—"}</span>
                    <span className={css.hideNarrow} style={{ ...sty.mono, textAlign: "right", color: r.gap < 5e-4 ? 'var(--pos)' : 'var(--text-dim)' }}>
                      {r.gap < 5e-4 ? "fastest" : "+" + r.gap.toFixed(3)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {cmp && (
            <SectionDetail
              seg={active != null ? cmp.segments[active] : null}
              pinned={pinned != null && pinned === active}
              onClear={() => setPinned(null)}
            />
          )}
        </aside>
      </div>

      {traces.length >= 2 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Corners, curves and straights</span>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>where the lap time was won and lost</span>
          </div>
          {cmp ? (
            <SegmentComparison cmp={cmp} active={active} onHover={setHoverSeg} onSelect={selectSeg} />
          ) : (
            <div style={{ color: 'var(--text-mute)', fontSize: 12, padding: 12 }}>
              Not enough telemetry to split these laps into corners and straights — the laps
              need location data and at least one detectable braking zone.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
