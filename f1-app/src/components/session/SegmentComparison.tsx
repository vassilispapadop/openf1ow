// "Where did the lap time actually go?" — splits the compared laps into corner
// and straight sections and times every trace through each one, so a delta on
// the trace chart can be attributed to cornering or to straight-line running.
//
// Sections come from the telemetry (see lib/lapSegments), not from a circuit
// database, so T-numbers are a running count of detected apexes rather than
// the official turn numbering.

import { useMemo } from "react";
import { C, F, sty } from "../../lib/styles";
import { rowBg } from "../../lib/format";
import { SECTION_COLORS, SECTION_LABELS } from "../../lib/constants";
import { compareLapSegments, type SegmentTrace, type SegmentTotals, type SectionKind } from "../../lib/lapSegments";
import SectionMap from "./SectionMap";

interface Props {
  traces: SegmentTrace[];
}

/** Signed seconds, always with a sign so gains and losses read at a glance. */
function sd(v: number, dp = 2): string {
  if (Math.abs(v) < 5e-3) return "0.00";
  return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(dp);
}

function deltaColor(v: number): string {
  if (Math.abs(v) < 5e-3) return C.textMute;
  return v < 0 ? C.pos : C.neg;
}

const KINDS: SectionKind[] = ["corner", "curve", "straight"];

/** Diverging bars: how much of a lap's deficit came from each kind of section.
 *  Bars grow from a shared centre line, left when the lap was quicker there. */
function SplitBars({ t, scale }: { t: SegmentTotals; scale: number }) {
  const rows: { kind: SectionKind; delta: number }[] = [
    { kind: "corner", delta: t.cornerDelta },
    { kind: "curve", delta: t.curveDelta },
    { kind: "straight", delta: t.straightDelta },
  ];
  const bar = (v: number) => {
    const pct = Math.min(100, (Math.abs(v) / scale) * 100);
    const color = v < 0 ? C.pos : C.neg;
    return (
      <div style={{ display: "flex", height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          {v < 0 && <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "4px 0 0 4px" }} />}
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.18)" }} />
        <div style={{ flex: 1, display: "flex" }}>
          {v > 0 && <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "0 4px 4px 0" }} />}
        </div>
      </div>
    );
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(r => (
        <div key={r.kind}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: SECTION_COLORS[r.kind], fontWeight: 600 }}>{SECTION_LABELS[r.kind]}</span>
            <span style={{ ...sty.mono, color: deltaColor(r.delta) }}>{sd(r.delta)}s</span>
          </div>
          {bar(r.delta)}
        </div>
      ))}
    </div>
  );
}

export default function SegmentComparison({ traces }: Props) {
  const cmp = useMemo(() => compareLapSegments(traces), [traces]);

  if (!cmp) {
    return (
      <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>
        Not enough telemetry to split these laps into corners and straights — the laps
        need location data and at least one detectable braking zone.
      </div>
    );
  }

  const { segments, totals, baselineLabel } = cmp;
  const others = totals.filter(t => !t.isBaseline);
  // Each card is scaled to its own driver. A shared scale sounds fairer, but
  // one scrappy lap in the set flattens everyone else's bars to nothing — and
  // the comparison that matters inside a card is corners against straights.
  const cardScale = (t: SegmentTotals) =>
    Math.max(0.05, Math.abs(t.cornerDelta), Math.abs(t.straightDelta));
  const maxSpread = Math.max(0.02, ...segments.map(s => {
    const times = s.timings.map(t => t.time);
    return Math.max(...times) - Math.min(...times);
  }));

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 12 }}>
        {cmp.cornerCount} corner sections ({Math.round(cmp.cornerDistance).toLocaleString()} m)
        {" · "}
        {cmp.straightCount} straights ({Math.round(cmp.straightDistance).toLocaleString()} m)
        {" · "}
        reference lap <span style={{ color: C.text, fontWeight: 600 }}>{baselineLabel}</span>
        {!cmp.fromGeometry && (
          <span style={{ color: C.warn }}>
            {" · "}no position data — sections read off braking and throttle, which misses flat-out corners
          </span>
        )}
      </div>

      {/* The classification drawn on the circuit, so it can be checked against
          a track map rather than taken on trust. */}
      {cmp.path.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionMap path={cmp.path} segments={segments} />
        </div>
      )}

      {/* Attribution: how much of each driver's gap came from corners vs straights */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(260px,380px))",
        gap: 12,
        marginBottom: 16,
      }}>
        {others.map(t => (
          <div key={t.label} style={{
            background: C.surfaceAlt,
            border: "1px solid " + C.border,
            borderLeft: "3px solid #" + t.color,
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t.label}</span>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 10, color: C.textMute }}>lap Δ</span>
                <span style={{ ...sty.mono, fontSize: 14, fontWeight: 700, color: deltaColor(t.totalDelta) }}>
                  {sd(t.totalDelta, 3)}s
                </span>
              </span>
            </div>
            <SplitBar t={t} scale={cardScale(t)} />
            <div style={{ fontSize: 10.5, color: C.textMute, marginTop: 9 }}>
              fastest through {t.cornersWon}/{cmp.cornerCount} corners
              {" · "}
              {t.straightsWon}/{cmp.straightCount} straights
            </div>
          </div>
        ))}
      </div>

      {/* Section-by-section breakdown */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 460 }}>
          <thead>
            <tr>
              <th style={{ ...sty.th, textAlign: "left" }}>Section</th>
              <th style={{ ...sty.th, textAlign: "right" }}>Length</th>
              {totals.map(t => (
                <th key={t.label} style={{ ...sty.th, textAlign: "right", color: "#" + t.color }}>
                  {t.label}{t.isBaseline ? " ★" : ""}
                </th>
              ))}
              <th style={{ ...sty.th, textAlign: "left", minWidth: 96 }}>Gap to fastest</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s, i) => {
              const kindColor = KIND_COLOR[s.kind];
              // How much the winner of this section took out of the slowest
              // lap through it, drawn in the winner's colour.
              const best = s.timings.reduce((m, t) => (t.time < m.time ? t : m), s.timings[0]);
              const slowest = s.timings.reduce((m, t) => (t.time > m.time ? t : m), s.timings[0]);
              const spread = slowest.time - best.time;
              return (
                <tr key={s.name + i} style={rowBg(i)}>
                  <td style={{ ...sty.td }}>
                    <span style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontWeight: 700,
                      color: kindColor,
                      background: s.kind === "corner" ? C.warnDim : "rgba(167,139,250,0.18)",
                      borderRadius: 4,
                      padding: "2px 6px",
                      marginRight: 8,
                      minWidth: 34,
                      textAlign: "center",
                    }}>{s.name}</span>
                    <span style={{ ...sty.mono, fontSize: 10, color: C.textFaint }}>
                      {Math.round(s.startDist).toLocaleString()}{"–"}{Math.round(s.endDist).toLocaleString()} m
                    </span>
                  </td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textMute, fontSize: 11 }}>
                    {Math.round(s.length).toLocaleString()} m
                  </td>
                  {s.timings.map(t => (
                    <td key={t.label} style={{ ...sty.td, textAlign: "right" }}>
                      <div style={{
                        ...sty.mono,
                        // The Gap column names the winner in their own colour;
                        // here weight alone separates quickest from the rest,
                        // so the two encodings don't fight.
                        fontWeight: t.fastest ? 700 : 500,
                        color: t.fastest ? C.text : C.textDim,
                      }}>{t.time.toFixed(2)}s</div>
                      <div style={{ ...sty.mono, fontSize: 10, color: C.textFaint, marginTop: 1 }}>
                        {s.kind === "corner"
                          ? "min " + Math.round(t.minSpeed)
                          : "top " + Math.round(t.maxSpeed)}
                      </div>
                    </td>
                  ))}
                  <td style={{ ...sty.td }}>
                    <div style={{ ...sty.mono, fontSize: 11, color: spread < 5e-3 ? C.textMute : "#" + best.color, marginBottom: 3 }}>
                      {spread < 5e-3 ? "level" : best.label.split(" ")[1] + " −" + spread.toFixed(2) + "s"}
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height: 5,
                        width: Math.min(100, (spread / maxSpread) * 100) + "%",
                        background: spread < 5e-3 ? "rgba(255,255,255,0.12)" : "#" + best.color,
                        borderRadius: 3,
                      }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: C.textMute, margin: "12px 4px 0", lineHeight: 1.5 }}>
        Sections come from the shape of the track, not from the driving: a{" "}
        <strong style={{ color: KIND_COLOR.corner }}>corner</strong> is where the racing line's radius drops below
        250 m — turns closer than 60 m apart, so chicanes and esses, count as one section — and everything else is
        a <strong style={{ color: KIND_COLOR.straight }}>straight</strong>, braking and acceleration zones
        included. That means a corner taken flat still counts as a corner. Every lap is cut at the same track
        positions and timed over its own start-to-line window, so the section times add up to the lap time and the
        corner and straight deltas add up to the lap-time gap exactly. Turn numbers are counted from the
        telemetry and won't always match the official circuit numbering, which splits some flowing complexes into
        several numbered turns. Car data samples at ~4 Hz, so an individual section gap carries around a tenth of
        noise even though the totals don't.
      </p>
    </div>
  );
}
