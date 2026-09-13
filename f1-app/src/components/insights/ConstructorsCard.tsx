// Constructor pace over the engine: every driver's clean laps pooled per
// team, fuel-corrected, with a bootstrap interval and the intra-team gap —
// all drivers who ran for the team, never sliced to two.

import { useMemo } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { constructorPace, SECTION_IDS, GATES, type ConstructorRow } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, type Column } from "../../ui";
import { C } from "../../lib/styles";
import { useSelection } from "../../contexts/SelectionContext";

export default function ConstructorsCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const result = useMemo(() => (model ? constructorPace(model) : null), [model]);
  if (!model || !result) return null;
  const max = result.ok ? Math.max(0.001, ...result.value.map(r => r.gapToFastest)) : 1;
  const columns: Column<ConstructorRow>[] = [
    { key: "rank", label: "#", render: (_r, i) => i + 1, mono: true, align: "right", width: 36 },
    { key: "team", label: "Team", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.color || "666") }} /><b>{r.team}</b></span> },
    { key: "median", label: "Pooled median", render: r => fmt.lapTime(r.medianPace), mono: true, align: "right", sort: (a, b) => a.medianPace - b.medianPace },
    { key: "gap", label: "Gap", render: r => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end", width: "100%" }}>
        <span className="hide-narrow" style={{ flex: "0 0 100px", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
          <span style={{ display: "block", width: `${Math.max(2, (r.gapToFastest / max) * 100)}%`, height: "100%", background: "#" + (r.color || "666"), borderRadius: 4, opacity: 0.8 }} />
        </span>
        <span>{r.gapToFastest < 5e-4 ? <span style={{ color: C.pos }}>fastest</span> : "+" + r.gapToFastest.toFixed(3)}</span>
      </span>
    ), mono: true, align: "right", sort: (a, b) => a.gapToFastest - b.gapToFastest },
    { key: "ci", label: "95 % interval", render: r => `±${((r.ci95[1] - r.ci95[0]) / 2).toFixed(3)}`, mono: true, align: "right", hideBelow: 640 },
    { key: "drivers", label: "Drivers", render: r => (
      <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
        {r.drivers.map(d => (
          <span key={d.driver.driver_number} style={{ fontSize: 11, opacity: sel.focusKeys && !sel.focusKeys.has(String(d.driver.driver_number)) ? 0.4 : 1 }}>
            <b>{d.driver.name_acronym}</b> <span style={{ color: C.textMute, fontFamily: "var(--mono)" }}>{d.medianPace != null ? fmt.lapTime(d.medianPace) : `${d.n} laps`}</span>
          </span>
        ))}
      </span>
    ), hideBelow: 480 },
    { key: "intra", label: "Intra-team", render: r => (r.intraTeamGap != null ? <span style={{ color: r.intraTeamGap < 0.1 ? C.pos : r.intraTeamGap < 0.3 ? C.warn : C.neg }}>{r.intraTeamGap.toFixed(3)}</span> : <span style={{ color: C.textFaint }}>—</span>), mono: true, align: "right", hideBelow: 640, sort: (a, b) => (a.intraTeamGap ?? 9) - (b.intraTeamGap ?? 9), title: "Slower driver's median minus faster driver's" },
    { key: "n", label: "Laps", render: r => r.n, mono: true, align: "right", hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.constructors}
      title="Constructor pace"
      hint="Which team had the fastest car: every driver's clean laps pooled into one team pace, fuel-corrected, with the gap between teammates beside it."
      method={{ summary: `Pooled median of all the team's clean laps, fuel-corrected to race-end load (≥ ${GATES.CONSTRUCTOR_MIN} laps); the interval is a 1 000-sample bootstrap of the median. Every driver who ran for the team counts. Intra-team gap is the difference of the two drivers' own medians where both clear the pace gate.` }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "constructor pace", filename: "openf1ow-constructors" }}
    >
      <Gate result={result} what="constructor pace" inline={false}>
        {v => <Table columns={columns} rows={v} rowKey={r => r.team} compact
          highlightKeys={new Set(v.filter(r => r.drivers.some(d => sel.selected.has(d.driver.driver_number))).map(r => r.team))} dimOthers={sel.selected.size > 0}
          onRowClick={r => r.drivers.forEach(d => sel.toggle(d.driver.driver_number))} onRowHover={r => sel.setHovered(r ? r.drivers[0]?.driver.driver_number ?? null : null)} />}
      </Gate>
    </Section>
  );
}
