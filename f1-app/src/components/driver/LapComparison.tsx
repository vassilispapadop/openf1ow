// The lap-comparison workspace: the telemetry traces on the left, and on the
// right a circuit map that follows them. Hover (or touch-drag) any trace and a
// dot per lap shows where each car physically was; move over the map and the
// crosshair on every trace follows. Beneath the map, a readout gives each
// lap's speed, throttle, brake, gear and time gap at that point, and the
// section of track the cursor is in. The per-section tables sit below.

import { useEffect, useMemo, useRef, useState } from "react";
import TelemetryStack from "./TelemetryStack";
import SegmentComparison, { SectionDetail } from "../session/SegmentComparison";
import SectionMap, { type MapMode } from "../session/SectionMap";
import TrackOutline, { type TrackRun } from "../../charts/TrackOutline";
import { Segmented, Panel } from "../../ui";
import type { Mark } from "../../charts/LineChart";
import { elapsedByDistance, elapsedAt, distanceAtElapsed, type LapTrace } from "../../engine/telemetry/compare.ts";
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

type Mode = MapMode | "speed";
const MODES: { key: Mode; label: string }[] = [
  { key: "gain", label: "Who gained" },
  { key: "kind", label: "Corner / straight" },
  { key: "speed", label: "Speed" },
];

/** Blue (slow) → cyan → yellow → red (fast). */
const SPEED_STOPS = ["#3b82f6", "#22d3ee", "#facc15", "#ef4444"];
const SPEED_BINS = 28;
function speedColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (SPEED_STOPS.length - 1);
  const i = Math.min(SPEED_STOPS.length - 2, Math.floor(x)), f = x - i;
  const a = SPEED_STOPS[i], b = SPEED_STOPS[i + 1];
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  return "#" + [0, 1, 2].map(k => Math.round(ch(a, k) + f * (ch(b, k) - ch(a, k))).toString(16).padStart(2, "0")).join("");
}

/** How much of the zoomed section's length is kept as margin either side. */
const ZOOM_PAD = 0.2;
/** Arrow-key step, as a share of the lap. */
const STEP_FRAC = 1 / 200;

const km = (d: number) => (d >= 1000 ? (d / 1000).toFixed(2) + " km" : Math.round(d) + " m");

export default function LapComparison({ traces, clippingEvents }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("gain");
  const rootRef = useRef<HTMLDivElement>(null);
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

  const trackLen = cmp?.trackDistance ?? (own?.length ? own[own.length - 1].distance : 0);
  const indexToDist = (i: number): number | null => {
    if (cmp?.path.length) return (i / (cmp.path.length - 1)) * trackLen;
    return own?.[i]?.distance ?? null;
  };

  // Official sector lines, placed on the distance axis from the lap's own
  // S1/S2 times — the first trace that carries them.
  const sectors = useMemo(() => {
    const i = traces.findIndex(t => t.lap?.sector1 && t.lap?.sector2);
    if (i < 0) return [];
    const { sector1, sector2 } = traces[i].lap!;
    return [["S1", sector1!], ["S2", sector1! + sector2!]].flatMap(([label, t]) => {
      const d = distanceAtElapsed(elapsed[i], t as number);
      const pos = d != null ? positionAt(traces[i].data, d) : null;
      return d != null ? [{ label: label as string, dist: d, pos }] : [];
    });
  }, [traces, elapsed]);
  const sectorMarks = useMemo<Mark[]>(
    () => sectors.map(s => ({ x: s.dist, label: s.label, kind: "flag", color: "#9a9aa6" })), [sectors]);
  const pins = useMemo(
    () => sectors.flatMap(s => (s.pos ? [{ ...s.pos, label: s.label }] : [])), [sectors]);

  // Speed mode colours the circuit by the reference lap's speed.
  const speedMap = useMemo(() => {
    if (!cmp?.path.length) return null;
    const ref = traces.find(t => t.label === cmp.baselineLabel) ?? traces[0];
    const n = cmp.path.length;
    const v = Array.from({ length: n }, (_, i) => {
      const d = (i / (n - 1)) * trackLen;
      return ref.data[indexAt(ref.data, d)]?.speed ?? 0;
    });
    const lo = Math.min(...v), hi = Math.max(...v);
    const bin = (x: number) => Math.min(SPEED_BINS - 1, Math.floor(((x - lo) / (hi - lo || 1)) * SPEED_BINS));
    const runs: TrackRun[] = [];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || bin(v[i]) !== bin(v[start])) {
        runs.push({ from: start, to: Math.min(n - 1, i), color: speedColor((bin(v[start]) + 0.5) / SPEED_BINS), width: 5 });
        start = i;
      }
    }
    return { runs, lo, hi, label: ref.label };
  }, [cmp, traces, trackLen]);

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
  // Pinning a section zooms the traces to it; a section that crosses the line has no single span to zoom to.
  const zoom = useMemo<[number, number] | null>(() => {
    const seg = pinned != null ? cmp?.segments[pinned] : null;
    if (!seg || seg.wraps) return null;
    const pad = (seg.endDist - seg.startDist) * ZOOM_PAD;
    return [Math.max(0, seg.startDist - pad), Math.min(trackLen, seg.endDist + pad)];
  }, [pinned, cmp, trackLen]);
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

  // ← → step the crosshair (shift = 5×), 1 2 3 switch the map, Esc resets.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (!(trackLen > 0)) return;
      e.preventDefault();
      const step = trackLen * STEP_FRAC * (e.shiftKey ? 5 : 1) * (e.key === "ArrowLeft" ? -1 : 1);
      setHoverX(h => Math.max(0, Math.min(trackLen, (h ?? (step > 0 ? 0 : trackLen)) + step)));
    } else if (e.key >= "1" && e.key <= String(MODES.length)) {
      const m = MODES[Number(e.key) - 1];
      if (m.key === "speed" ? speedMap : cmp) setMode(m.key);
    } else if (e.key === "Escape") {
      setHoverX(null); setPinned(null); setHoverSeg(null);
    }
  };
  // Hovering the workspace takes focus so the keys work without a click first.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const take = () => { if (!el.contains(document.activeElement)) el.focus({ preventScroll: true }); };
    el.addEventListener("pointerenter", take);
    return () => el.removeEventListener("pointerenter", take);
  }, []);

  const speedAvailable = !!speedMap;
  const modes = MODES.filter(m => (m.key === "speed" ? speedAvailable : !!cmp));

  return (
    <div style={{ fontFamily: F }} ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className={css.root}>
      <div className={css.workspace}>
        <div style={{ minWidth: 0 }} className={css.scrub}>
          {zoom && pinned != null && cmp && (
            <button className={css.zoomChip} onClick={() => setPinned(null)}>
              Zoomed to <strong>{cmp.segments[pinned].name}</strong> · reset ×
            </button>
          )}
          <TelemetryStack traces={traces} clippingEvents={clippingEvents} sectorMarks={sectorMarks} range={zoom} hoverX={hoverX} onHoverX={setHoverX} />
          <div className={css.kbd} aria-hidden="true">← → step the crosshair · shift = faster · 1 2 3 switch the map · esc reset</div>
        </div>

        <aside className={css.side} aria-label="Circuit map">
          {path && (
            <Panel>
              {modes.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <Segmented
                    size="sm"
                    variant="inverted"
                    options={modes}
                    value={mode}
                    onChange={(k: string) => setMode(k as Mode)}
                  />
                </div>
              )}
              {cmp && mode === "speed" && speedMap ? (
                <TrackOutline
                  path={cmp.path}
                  runs={speedMap.runs}
                  height={380}
                  ariaLabel="Circuit map coloured by speed"
                  markers={markers}
                  pins={pins}
                  onPointerIndex={onPointerIndex}
                  legend={(
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%" }}>
                      <span style={{ ...sty.mono, fontSize: 11 }}>{Math.round(speedMap.lo)}</span>
                      <span style={{ flex: 1, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${SPEED_STOPS.join(", ")})` }} />
                      <span style={{ ...sty.mono, fontSize: 11 }}>{Math.round(speedMap.hi)} km/h</span>
                      <span style={{ color: 'var(--text-mute)' }}>{speedMap.label}</span>
                    </span>
                  )}
                />
              ) : cmp ? (
                <SectionMap
                  path={cmp.path}
                  segments={cmp.segments}
                  mode={mode === "kind" ? "kind" : "gain"}
                  height={380}
                  active={active}
                  onHover={setHoverSeg}
                  onSelect={selectSeg}
                  drivers={cmp.totals.map(t => ({ label: t.label, color: t.color }))}
                  maxSpread={maxSpread}
                  markers={markers}
                  pins={pins}
                  onPointerIndex={onPointerIndex}
                />
              ) : (
                <TrackOutline
                  path={path}
                  runs={[{ from: 0, to: path.length - 1, color: "var(--text-mute)", opacity: 0.6, width: 4 }]}
                  height={380}
                  ariaLabel="Circuit map"
                  markers={markers}
                  pins={pins}
                  onPointerIndex={onPointerIndex}
                />
              )}
            </Panel>
          )}

          <Panel>
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
          </Panel>

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
