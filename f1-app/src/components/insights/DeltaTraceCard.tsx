// The race as gap lines: every driver's cumulative time against a reference
// — the winner, the leader at each lap, or any driver — with safety-car
// bands and pit stops marked. Where the timing feed agrees, the tooltip
// shows its gap too.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { deltaTrace, SECTION_IDS, type DeltaReference } from "../../engine/index.ts";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt } from "../../charts/core/scales";
import { Section, Gate } from "../../ui";
import { C } from "../../lib/styles";
import { useSelection } from "../../contexts/SelectionContext";

const BAND_COLOR: Record<string, string> = { SC: "rgba(255,181,71,0.10)", VSC: "rgba(255,181,71,0.06)", RED: "rgba(255,84,114,0.12)" };

export default function DeltaTraceCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const [refSel, setRefSel] = useState<string>("winner");
  const ref = useMemo<DeltaReference>(() => (refSel === "winner" ? { kind: "winner" } : refSel === "leader" ? { kind: "leader" } : { kind: "driver", driverNumber: Number(refSel) }), [refSel]);
  const result = useMemo(() => (model ? deltaTrace(model, ref) : null), [model, ref]);
  if (!model || !result) return null;

  const series: Series[] = result.ok ? result.value.series.map(sr => ({
    key: String(sr.driver.driver_number),
    label: sr.driver.name_acronym,
    color: "#" + (sr.driver.team_colour || "666"),
    dash: isSecondDriverOfTeam(model, sr.driver.driver_number),
    points: sr.points.map(p => ({ x: p.lap, y: p.delta })),
    rank: sr.points[sr.points.length - 1]?.delta ?? Infinity,
  })).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)) : [];

  const top = new Set(series.slice(0, 6).map(sr => sr.key));

  return (
    <Section
      id={SECTION_IDS.deltaTrace}
      title="Gap to reference, lap by lap"
      hint="Cumulative race time against the reference. Flat = same pace; rising = losing time. Pit stops show as steps; shaded bands are safety-car, VSC and red-flag periods."
      method={{
        summary: "Each driver's summed lap times minus the reference's at the same lap number; the line stops at the first untimed lap (retirement). 'Race leader' uses whoever had the lowest cumulative time on each lap.",
        caveats: ["Differences include pit-lane time, so a stop reads as a jump of roughly the pit loss."],
      }}
      actions={(
        <select value={refSel} onChange={e => setRefSel(e.target.value)} style={selectStyle} aria-label="Reference">
          <option value="winner">vs winner</option>
          <option value="leader">vs race leader</option>
          {model.drivers.slice().sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99)).map(d => (
            <option key={d.driver.driver_number} value={String(d.driver.driver_number)}>vs {d.driver.name_acronym}</option>
          ))}
        </select>
      )}
      share={{ meta: "gap to reference", filename: "openf1ow-delta-trace" }}
    >
      <Gate result={result} what="lap times" inline={false}>
        {v => (
          <LineChart
            series={series}
            height={380}
            curve="linear"
            x={{ domain: [1, v.totalLaps], format: l => `Lap ${l}`, label: "Lap" }}
            y={{ format: y => fmt.signedSec(y, 1), invert: true, includeZero: true, zeroLine: "reference", zeroLabel: v.reference.label, targetTicks: 6 }}
            bands={v.bands.map(b => ({ from: b.fromLap - 0.5, to: b.toLap + 0.5, color: BAND_COLOR[b.kind], label: b.kind }))}
            focus={sel.focusKeys ?? top}
            hovered={sel.hoveredKey}
            onHover={k => sel.setHovered(k ? Number(k) : null)}
            onSelect={k => sel.toggle(Number(k))}
            format={y => fmt.signedSec(y)}
            tipTitle={l => `Lap ${l} · vs ${v.reference.label}`}
            endLabels
            legend={{ columns: 2, compact: true, hint: true }}
            ariaLabel="Cumulative gap to the reference by lap"
          />
        )}
      </Gate>
    </Section>
  );
}

/** Second driver of a team gets a dashed line so teammates in one livery are told apart without colour. */
export function isSecondDriverOfTeam(model: NonNullable<ReturnType<typeof useSessionModel>["model"]>, dn: number): boolean {
  const d = model.byDriver[dn];
  if (!d) return false;
  const mates = model.teams[d.team]?.drivers ?? [];
  return mates.findIndex(x => x.driver_number === dn) > 0;
}

const selectStyle: React.CSSProperties = {
  background: C.surfaceAlt, color: C.text, border: "1px solid " + C.border, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font)",
};
