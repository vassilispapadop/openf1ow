// What if the stop had come earlier or later? Pick a driver and a stop,
// drag the shift, and read the predicted change in race time and finishing
// position — the baseline as a dashed ghost, the scenario solid, against
// the winner's real cumulative time.

import { useEffect, useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { whatIfPitShift, whatIfRange, SECTION_IDS } from "../../engine/index.ts";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, StatTile, Badge } from "../../ui";
import { C } from "../../lib/styles";
import { TC } from "../../lib/constants";
import Pill from "../Pill";
import { useSelection } from "../../contexts/SelectionContext";

const MAX_SHIFT = 10;

export default function WhatIfCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const drivers = useMemo(() => (model ? model.drivers.filter(d => d.pits.some(p => p.lap_number)).sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99)) : []), [model]);
  const firstSelected = [...sel.selected].find(dn => drivers.some(d => d.driver.driver_number === dn));
  const [dn, setDn] = useState<number | null>(null);
  const [stopIndex, setStopIndex] = useState(0);
  const [shift, setShift] = useState(0);
  const driverNumber = dn ?? firstSelected ?? drivers[0]?.driver.driver_number ?? null;

  // A new driver or stop resets the shift and clamps the stop index.
  useEffect(() => { setShift(0); }, [driverNumber, stopIndex]);
  useEffect(() => { setStopIndex(0); }, [driverNumber]);

  const range = useMemo(() => (model && driverNumber != null ? whatIfRange(model, driverNumber, stopIndex) : null), [model, driverNumber, stopIndex]);
  const lo = range ? Math.max(range[0], -MAX_SHIFT) : -MAX_SHIFT, hi = range ? Math.min(range[1], MAX_SHIFT) : MAX_SHIFT;
  const result = useMemo(() => (model && driverNumber != null ? whatIfPitShift(model, { driverNumber, stopIndex, shiftLaps: Math.max(lo, Math.min(hi, shift)) }) : null), [model, driverNumber, stopIndex, shift, lo, hi]);
  if (!model || !drivers.length || driverNumber == null || !result) return null;
  const d = model.byDriver[driverNumber];
  const stops = d.pits.slice().sort((x, y) => (x.lap_number ?? 0) - (y.lap_number ?? 0));

  // Cumulative delta to the winner's real race, baseline and scenario.
  const winner = model.drivers.find(x => x.classification.position === 1) ?? d;
  const winCum: number[] = [];
  let acc = 0;
  for (const l of winner.laps.slice().sort((a, b) => a.lap_number - b.lap_number)) { if (!l.lap_duration || l.lap_duration <= 0) break; acc += l.lap_duration; winCum[l.lap_number] = acc; }
  const series: Series[] = result.ok ? (() => {
    let b = 0, s = 0;
    const base: { x: number; y: number }[] = [], scen: { x: number; y: number }[] = [];
    for (const r of result.value.laps) {
      b += r.baseline; s += r.scenario;
      const w = winCum[r.lap];
      if (w == null) continue;
      base.push({ x: r.lap, y: b - w }); scen.push({ x: r.lap, y: s - w });
    }
    const colour = "#" + (d.driver.team_colour || "666");
    return [
      { key: "scenario", label: `${d.driver.name_acronym} · stop on lap ${result.value.stop.newLap}`, color: colour, points: scen },
      { key: "baseline", label: `${d.driver.name_acronym} · actual (stop lap ${result.value.stop.lap})`, color: colour, dash: true, points: base },
    ];
  })() : [];

  const marks = result.ok ? [
    { x: result.value.stop.lap, kind: "flag" as const, label: "actual stop", color: "var(--text-faint)" },
    ...(result.value.shift !== 0 ? [{ x: result.value.stop.newLap, kind: "flag" as const, label: "what-if stop", color: "var(--warn)" }] : []),
  ] : [];

  return (
    <Section
      id={SECTION_IDS.whatIfPit}
      title="What if the stop had come earlier or later?"
      hint="A counterfactual from the driver's own stint fits: move a pit stop by up to ten laps and see what the race time and finishing position would have done. Everyone else's race stays as it was."
      method={{
        summary: "Laps that change compound are re-predicted from the other stint's fitted degradation at their new tyre age (fuel added back); laps that only change tyre age move along their own stint's slope; the pit laps carry the stop's green-flag cost; safety-car, VSC and red-flag laps are held fixed. The range comes from the two fits' 95 % slope intervals. Position is the cumulative time at the driver's last lap against the field's real times.",
        caveats: ["Nobody else reacts, traffic does not change, and a slope is assumed to hold beyond the tyre ages the stint actually saw.", "Where a stint has too few clear-air laps for its own fit, the field's pooled slope for that compound is used and the confidence drops."],
      }}
      confidence={result.ok ? result.confidence : undefined}
      actions={(
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={driverNumber} onChange={e => setDn(Number(e.target.value))} style={selectStyle} aria-label="Driver">
            {drivers.map(x => <option key={x.driver.driver_number} value={x.driver.driver_number}>{x.classification.position ? `P${x.classification.position} · ` : ""}{x.driver.name_acronym}</option>)}
          </select>
          {stops.length > 1 && (
            <select value={stopIndex} onChange={e => setStopIndex(Number(e.target.value))} style={selectStyle} aria-label="Stop">
              {stops.map((p, i) => <option key={i} value={i}>Stop {i + 1} · lap {p.lap_number}</option>)}
            </select>
          )}
        </div>
      )}
      share={{ meta: "what-if pit stop", filename: "openf1ow-what-if" }}
    >
      <Gate result={result} what="a what-if for this stop" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Pill size="sm" onClick={() => setShift(s => Math.max(lo, s - 1))} disabled={v.shift <= lo} aria-label="One lap earlier">−1</Pill>
              <input type="range" min={lo} max={hi} step={1} value={v.shift} onChange={e => setShift(Number(e.target.value))} aria-label="Shift the stop by laps" style={{ flex: "1 1 200px", accentColor: "#" + (d.driver.team_colour || "666") }} />
              <Pill size="sm" onClick={() => setShift(s => Math.min(hi, s + 1))} disabled={v.shift >= hi} aria-label="One lap later">+1</Pill>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, minWidth: 150 }}>
                {v.shift === 0 ? `as raced · lap ${v.stop.lap}` : `${v.shift > 0 ? "+" : ""}${v.shift} laps → lap ${v.stop.newLap}`}
              </span>
              {v.shift !== 0 && <Pill size="sm" onClick={() => setShift(0)}>Reset</Pill>}
              <span style={{ fontSize: 11, color: C.textMute }}>
                <span style={{ color: TC[v.stop.from] || C.textDim, fontWeight: 700 }}>{v.stop.from}</span> → <span style={{ color: TC[v.stop.to] || C.textDim, fontWeight: 700 }}>{v.stop.to}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <StatTile grow label="Race time" value={v.shift === 0 ? "—" : fmt.signedSec(v.delta, 1) + " s"} mono accent={v.delta < 0 ? C.pos : v.delta > 0 ? C.neg : undefined}
                sub={v.shift === 0 ? "move the slider" : `range ${fmt.signedSec(v.deltaRange[0], 1)} to ${fmt.signedSec(v.deltaRange[1], 1)} s`} />
              <StatTile grow label="Finishing position" value={v.positionAfter != null ? `P${v.positionAfter}` : "—"} mono
                accent={v.positionBefore != null && v.positionAfter != null ? (v.positionAfter < v.positionBefore ? C.pos : v.positionAfter > v.positionBefore ? C.neg : undefined) : undefined}
                sub={v.positionBefore != null ? (v.positionAfter === v.positionBefore ? `unchanged from P${v.positionBefore}` : `from P${v.positionBefore}`) : ""} />
              <StatTile grow label="Stop cost" value={(v.movedUnderNeutralisation && v.scStopCost != null ? v.scStopCost : v.pitCost).toFixed(1) + " s"} mono sub={v.movedUnderNeutralisation ? (v.scStopCost != null ? "under the safety car, as it cost this race" : "under the safety car — cost unknown") : v.pitCostSource} />
              <StatTile grow label="Model" value={v.pooledFits.length ? "pooled slope" : "own fits"} sub={v.extrapolatedLaps ? <Badge tone="warn" size="sm">{v.extrapolatedLaps} laps extrapolated</Badge> : "within the ages the stints saw"} />
            </div>
            <LineChart
              series={series}
              height={260}
              curve="linear"
              endDots={false}
              endLabels
              x={{ domain: [1, model.totalLaps], format: l => `Lap ${l}`, label: "Lap" }}
              y={{ format: y => fmt.signedSec(y, 1), invert: true, includeZero: true, zeroLine: "reference", zeroLabel: winner.driver.name_acronym === d.driver.name_acronym ? "own actual pace" : `${winner.driver.name_acronym} (winner)`, targetTicks: 5 }}
              marks={marks}
              format={y => fmt.signedSec(y)}
              tipTitle={l => `Lap ${l} · gap to ${winner.driver.name_acronym}`}
              legend={{ columns: 2, compact: true }}
              rankTooltip={false}
              ariaLabel="Cumulative gap to the winner, actual and what-if"
            />
          </>
        )}
      </Gate>
    </Section>
  );
}

const selectStyle: React.CSSProperties = {
  background: C.surfaceAlt, color: C.text, border: "1px solid " + C.border, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font)",
};
