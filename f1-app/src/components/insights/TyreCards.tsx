// Tyres and fuel over the engine: every stint's fitted degradation with its
// interval, R² and any cliff, the compound summary from those same fits,
// and the fuel model the whole page is corrected with.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { compoundSummary, driverDegradation, fuelKgAtLap, SECTION_IDS, GATES, type EnrichedStint, type DriverDegRow } from "../../engine/index.ts";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, StatTile, Badge, Segmented, type Column } from "../../ui";
import { C } from "../../lib/styles";
import { TC } from "../../lib/constants";
import { useSelection } from "../../contexts/SelectionContext";

interface StintRow { stint: EnrichedStint; driver: { driver_number: number; name_acronym: string; team_colour: string }; team: string }

const ms = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v * 1000).toFixed(0) + " ms";

export function DegradationCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const [view, setView] = useState<"stints" | "drivers">("stints");
  const perDriver = useMemo(() => (model ? driverDegradation(model) : null), [model]);
  const rows = useMemo<StintRow[]>(() => (model ? model.drivers.flatMap(d => d.stints.map(stint => ({ stint, driver: d.driver, team: d.team }))) : []), [model]);
  if (!model || !perDriver) return null;
  const fitted = rows.filter(r => r.stint.deg.ok);

  // Chart: fuel-corrected time against tyre age for the stints in focus (the
  // selection, else the six lowest slopes), each with its fitted line.
  const focusDn = sel.focusKeys ? new Set([...sel.focusKeys].map(Number)) : null;
  const shown = (focusDn ? fitted.filter(r => focusDn.has(r.driver.driver_number)) : fitted.slice().sort((a, b) => (a.stint.deg.ok && b.stint.deg.ok ? a.stint.deg.value.slope - b.stint.deg.value.slope : 0)).slice(0, 6));
  const series: Series[] = shown.flatMap(r => {
    if (!r.stint.deg.ok) return [];
    const f = r.stint.deg.value;
    const key = `${r.driver.driver_number}-${r.stint.stint_number}`;
    const ages = r.stint.fitLaps.map(l => l.tyreAge as number);
    const a0 = Math.min(...ages), a1 = Math.max(...ages);
    return [
      { key, label: `${r.driver.name_acronym} S${r.stint.stint_number} ${r.stint.compound[0]}`, color: "#" + (r.driver.team_colour || "666"), dash: r.stint.stint_number % 2 === 0,
        points: r.stint.fitLaps.map(l => ({ x: l.tyreAge as number, y: l.fuelCorrected as number })) },
      { key: key + "-fit", label: `${r.driver.name_acronym} S${r.stint.stint_number} fit`, color: "#" + (r.driver.team_colour || "666"), dash: true,
        points: [{ x: a0, y: f.intercept + f.slope * a0 }, { x: a1, y: f.intercept + f.slope * a1 }] },
    ];
  });

  const stintCols: Column<StintRow>[] = [
    { key: "driver", label: "Driver", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.driver.team_colour || "666") }} /><b>{r.driver.name_acronym}</b><span style={{ color: C.textMute, fontSize: 11 }}>S{r.stint.stint_number}</span></span> },
    { key: "compound", label: "Tyre", render: r => <span style={{ color: TC[r.stint.compound] || C.textDim, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em" }}>{r.stint.compound}</span> },
    { key: "laps", label: "Laps", render: r => `L${r.stint.lap_start}–${r.stint.lap_end}`, mono: true, align: "right", hideBelow: 640 },
    { key: "n", label: "Fit laps", render: r => (r.stint.deg.ok ? r.stint.deg.n : <span style={{ color: C.textFaint }}>{r.stint.fitLaps.length} (min {GATES.DEG_MIN_LAPS})</span>), mono: true, align: "right", hideBelow: 480 },
    { key: "slope", label: "Deg / lap", render: r => (r.stint.deg.ok ? <span style={{ color: r.stint.deg.value.slope > 0.1 ? C.neg : r.stint.deg.value.slope > 0.05 ? C.warn : C.pos }}>{ms(r.stint.deg.value.slope)}</span> : <span style={{ color: C.textFaint }}>—</span>), mono: true, align: "right", sort: (a, b) => (a.stint.deg.ok ? a.stint.deg.value.slope : Infinity) - (b.stint.deg.ok ? b.stint.deg.value.slope : Infinity) },
    { key: "ci", label: "95 %", render: r => (r.stint.deg.ok ? `${ms(r.stint.deg.value.ci95[0])} … ${ms(r.stint.deg.value.ci95[1])}` : "—"), mono: true, align: "right", hideBelow: 900 },
    { key: "r2", label: "R²", render: r => (r.stint.deg.ok ? <span style={{ color: r.stint.deg.value.r2 < 0.2 ? C.textFaint : undefined }}>{r.stint.deg.value.r2.toFixed(2)}</span> : "—"), mono: true, align: "right", hideBelow: 640 },
    { key: "cliff", label: "", render: r => (r.stint.cliff.ok ? <Badge tone="neg" size="sm" title={`Slope ${ms(r.stint.cliff.value.slopeBefore)} → ${ms(r.stint.cliff.value.slopeAfter)} per lap`}>cliff at {r.stint.cliff.value.atTyreAge}</Badge> : null) },
  ];
  const driverCols: Column<DriverDegRow>[] = [
    { key: "rank", label: "#", render: (_r, i) => i + 1, mono: true, align: "right", width: 36 },
    { key: "driver", label: "Driver", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.driver.team_colour || "666") }} /><b>{r.driver.name_acronym}</b><span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{r.team}</span></span> },
    { key: "deg", label: "Deg / lap", render: r => <span style={{ color: r.weightedDeg > 0.1 ? C.neg : r.weightedDeg > 0.05 ? C.warn : C.pos }}>{ms(r.weightedDeg)}</span>, mono: true, align: "right", sort: (a, b) => a.weightedDeg - b.weightedDeg, title: "Lap-weighted mean of the fitted stint slopes" },
    { key: "stints", label: "Stints", render: r => r.stints, mono: true, align: "right", hideBelow: 480 },
    { key: "laps", label: "Fit laps", render: r => r.fitLaps, mono: true, align: "right", hideBelow: 480 },
    { key: "comp", label: "Compounds", render: r => <span style={{ display: "inline-flex", gap: 6 }}>{r.compounds.map(c => <span key={c} style={{ color: TC[c] || C.textDim, fontWeight: 700, fontSize: 10 }}>{c[0]}</span>)}</span>, hideBelow: 640 },
    { key: "best", label: "Best stint", render: r => (r.bestStint && r.bestStint.deg.ok ? `S${r.bestStint.stint_number} ${r.bestStint.compound[0]} ${ms(r.bestStint.deg.value.slope)}` : "—"), mono: true, align: "right", hideBelow: 900 },
  ];
  const stintKey = (r: StintRow) => `${r.driver.driver_number}-${r.stint.stint_number}`;
  const hl = new Set(rows.filter(r => sel.selected.has(r.driver.driver_number)).map(stintKey));

  return (
    <Section
      id={SECTION_IDS.degradation}
      title="Tyre degradation"
      hint="How much slower each stint got per lap of tyre age, once fuel burn is taken out. Each fit carries its interval and R², and a two-segment test flags a cliff. Negative slopes are allowed — a tyre coming in is a real thing."
      method={{
        summary: `Per stint: ordinary least squares of fuel-corrected lap time on tyre age over clean, clear-air laps from tyre age 2 (warm-up excluded), at least ${GATES.DEG_MIN_LAPS}. Confidence falls when the interval is wide, R² is low, or the robust (Theil–Sen) slope disagrees. Cliff: a two-segment fit beats one by ΔBIC > 6 with a slope jump over max(0.15 s, 3 se), on ${GATES.CLIFF_MIN_LAPS}+ laps.`,
        steps: [`Fuel effect ${model.fuel.secPerKg.toFixed(3)} s/kg (${model.fuel.source}).`],
      }}
      confidence={perDriver.ok ? perDriver.confidence : undefined}
      actions={<Segmented size="sm" role="radiogroup" ariaLabel="Degradation view" value={view} onChange={setView} options={[{ key: "stints", label: "Stints" }, { key: "drivers", label: "Drivers" }]} />}
      share={{ meta: "tyre degradation", filename: "openf1ow-degradation" }}
    >
      {series.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <LineChart
            series={series}
            height={280}
            curve="linear"
            showDots
            endDots={false}
            hidden={new Set(series.filter(s => s.key.endsWith("-fit")).map(s => s.key).filter(() => false))}
            x={{ format: a => `${a} laps`, label: "Tyre age", targetTicks: 8 }}
            y={{ format: fmt.lapTime, targetTicks: 5 }}
            format={y => fmt.lapTime(y)}
            tipTitle={a => `Tyre age ${a} · fuel-corrected`}
            hovered={sel.hoveredKey ? series.find(s => s.key.startsWith(sel.hoveredKey + "-"))?.key ?? null : null}
            onHover={k => sel.setHovered(k ? Number(k.split("-")[0]) : null)}
            onSelect={k => sel.toggle(Number(k.split("-")[0]))}
            legend={{ columns: 3, compact: true }}
            rankTooltip={false}
            ariaLabel="Fuel-corrected lap time against tyre age for the stints in focus, with fitted lines"
          />
          <p style={{ fontSize: 11, color: C.textFaint, margin: "6px 4px 0" }}>{sel.focusKeys ? "Stints of the selected drivers" : "The six lowest-degradation stints"} — dashed lines are the fits. Select drivers in any table to change the set.</p>
        </div>
      )}
      {view === "stints"
        ? <Table columns={stintCols} rows={rows.filter(r => r.stint.fitLaps.length > 0)} rowKey={stintKey} compact maxHeight={520} defaultSort={{ key: "slope", dir: "asc" }} highlightKeys={hl} dimOthers={sel.selected.size > 0} onRowClick={r => sel.toggle(r.driver.driver_number)} onRowHover={r => sel.setHovered(r ? r.driver.driver_number : null)} />
        : <Gate result={perDriver} what="tyre management" inline={false}>{v => <Table columns={driverCols} rows={v} rowKey={r => r.driver.driver_number} compact maxHeight={520} highlightKeys={sel.selected} dimOthers onRowClick={r => sel.toggle(r.driver.driver_number)} onRowHover={r => sel.setHovered(r ? r.driver.driver_number : null)} />}</Gate>}
    </Section>
  );
}

export function CompoundsCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? compoundSummary(model) : null), [model]);
  if (!model || !result) return null;
  return (
    <Section
      id="compounds"
      title="Compounds"
      hint="Each compound's degradation, pace and stint length across the field, from the same stint fits as above."
      method={{ summary: "Median (and interquartile range) of the fitted stint slopes per compound; median clear-air fuel-corrected pace; median stint length over every stint on the compound." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "compounds", filename: "openf1ow-compounds" }}
    >
      <Gate result={result} what="compound fits">
        {v => (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
            {v.map(c => (
              <div key={c.compound} style={{ background: C.surfaceAlt, borderRadius: 10, padding: "12px 14px", border: "1px solid " + C.border, borderTop: "2px solid " + (TC[c.compound] || "#666") }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TC[c.compound] || C.text }}>{c.compound}</span>
                  <span style={{ fontSize: 11, color: C.textMute }}>{c.stints} of {c.stintsSeen} stints fitted</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 12px", fontSize: 11 }}>
                  <span style={{ color: C.textMute }}>Deg / lap</span><span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: c.medianDeg > 0.1 ? C.neg : c.medianDeg > 0.05 ? C.warn : C.pos }}>{ms(c.medianDeg)} <span style={{ color: C.textFaint, fontWeight: 400 }}>({ms(c.degIqr[0])}…{ms(c.degIqr[1])})</span></span>
                  <span style={{ color: C.textMute }}>Clear-air pace</span><span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{c.medianPace != null ? fmt.lapTime(c.medianPace) : "—"}</span>
                  <span style={{ color: C.textMute }}>Median stint</span><span style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{c.medianStintLength.toFixed(0)} laps</span>
                  <span style={{ color: C.textMute }}>Cliffs</span><span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: c.cliffs ? C.neg : undefined }}>{c.cliffs}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Gate>
    </Section>
  );
}

export function FuelCard() {
  const { model } = useSessionModel();
  if (!model) return null;
  const f = model.fuel;
  const laps = Array.from({ length: model.totalLaps }, (_, i) => i + 1);
  const kg = laps.map(l => ({ x: l, y: fuelKgAtLap(f, l) }));
  const gain = laps.map(l => ({ x: l, y: (f.startKg - fuelKgAtLap(f, l)) * f.secPerKg }));
  return (
    <Section
      id={SECTION_IDS.fuel}
      title="Fuel model"
      hint={`Every pace figure on this page is corrected to race-end fuel load with this model. ${f.source === "fitted" ? "The per-kilogram effect was fitted from this race." : "The textbook 55 ms/kg is used — the race had too few comparable lap pairs to fit its own."}`}
      method={{
        summary: `Start ${f.startKg} kg (${f.sprint ? "sprint" : "Grand Prix"}), burned linearly over ${model.totalLaps} laps. The effect is fitted per race from same-compound, equal-tyre-age clean clear-air lap pairs across stints (median; accepted with ≥ ${GATES.FUEL_FIT_MIN_PAIRS} pairs, within 0.025–0.08 s/kg and an IQR under 0.04); otherwise 0.055 s/kg.`,
      }}
      confidence={f.source === "fitted" ? "medium" : "low"}
      share={{ meta: "fuel model", filename: "openf1ow-fuel" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <StatTile grow label="Effect" value={(f.secPerKg * 1000).toFixed(0) + " ms/kg"} mono accent={f.source === "fitted" ? C.pos : C.warn} sub={f.source === "fitted" ? `fitted from ${f.fitPairs} lap pairs${f.fitIqr != null ? ` · IQR ${(f.fitIqr * 1000).toFixed(0)} ms` : ""}` : `default · ${f.fitPairs} pairs available`} />
        <StatTile grow label="Start load" value={`${f.startKg} kg`} mono sub={`${f.kgPerLap.toFixed(2)} kg per lap`} />
        <StatTile grow label="Per lap" value={(f.kgPerLap * f.secPerKg * 1000).toFixed(0) + " ms"} mono sub="quicker every lap from fuel alone" />
        <StatTile grow label="Over the race" value={(f.startKg * f.secPerKg).toFixed(2) + " s"} mono sub="lap 1 vs empty tanks" />
      </div>
      <LineChart
        series={[{ key: "gain", label: "Lap-time gain from fuel burn", color: C.violet, points: gain }]}
        height={180}
        curve="linear"
        endLabels
        x={{ domain: [1, Math.max(2, model.totalLaps)], format: l => `Lap ${l}`, label: "Lap" }}
        y={{ format: v => v.toFixed(2) + " s", includeZero: true, targetTicks: 4 }}
        format={(v, k) => (k === "gain" ? v.toFixed(3) + " s" : v.toFixed(1) + " kg")}
        tipTitle={l => `Lap ${l} · ${kg[l - 1]?.y.toFixed(1)} kg on board`}
        legend={false}
        rankTooltip={false}
        ariaLabel="Cumulative lap-time gain from fuel burn by lap"
      />
    </Section>
  );
}
