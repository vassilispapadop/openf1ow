// Battles tab cards over the engine: teammates with statistical weight,
// overtakes by kind, who gained under the safety car, and what traffic cost.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import {
  teammateComparisons, overtakeAnalysis, neutralisationImpact, dirtyAirAnalysis, SECTION_IDS,
  type TeamComparison, type DriverOvertakes, type ImpactRow, type DriverTraffic,
} from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, Badge, Segmented, type Column } from "../../ui";
import { C } from "../../lib/styles";

const drv = (d: { name_acronym: string; team_colour: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 3, height: 13, borderRadius: 2, background: "#" + (d.team_colour || "666") }} /><b>{d.name_acronym}</b>
  </span>
);

export function TeammatesCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? teammateComparisons(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<TeamComparison>[] = [
    { key: "team", label: "Team", render: t => <b>{t.team}</b> },
    { key: "faster", label: "Quicker", render: t => drv(t.primary.faster) },
    { key: "gap", label: "Gap / lap", render: t => <span style={{ color: t.primary.significant ? C.pos : C.text }}>{t.primary.gap.toFixed(3)} s</span>, align: "right", mono: true, sort: (a, b) => a.primary.gap - b.primary.gap },
    { key: "ci", label: "95 % interval", render: t => `${fmt.signedSec(t.primary.ci95[0])} … ${fmt.signedSec(t.primary.ci95[1])}`, align: "right", mono: true, hideBelow: 900 },
    { key: "wins", label: "Laps won", render: t => `${Math.max(t.primary.winsA, t.primary.winsB)} – ${Math.min(t.primary.winsA, t.primary.winsB)}`, align: "right", mono: true, hideBelow: 480 },
    { key: "n", label: "Paired", render: t => t.primary.n, align: "right", mono: true, hideBelow: 640 },
    { key: "p", label: "p", render: t => t.primary.pValue.toFixed(3), align: "right", mono: true, hideBelow: 900, title: "Paired sign test" },
    { key: "sig", label: "", render: t => (t.primary.significant ? <Badge tone="pos" size="sm">significant</Badge> : <Badge tone="mute" size="sm">not clear</Badge>) },
  ];
  return (
    <Section
      id={SECTION_IDS.teammates}
      title="Teammates, on the same laps"
      hint="Same lap number, both clean, both in the same traffic state — so one driver's traffic is never read as the other's pace. Head-to-head laps won come from the same paired set."
      method={{ summary: "Median of the fuel-corrected difference over paired laps, with a 1 000-sample bootstrap interval and a paired sign test. 'Significant' = the interval excludes zero on at least 10 paired laps. Every driver on a team is compared; the pair with the most shared laps is shown." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "teammate comparison", filename: "openf1ow-teammates" }}
    >
      <Gate result={result} what="paired teammate laps">
        {v => <Table columns={columns} rows={v} rowKey={t => t.team} compact />}
      </Gate>
    </Section>
  );
}

export function OvertakesCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? overtakeAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<DriverOvertakes>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver) },
    { key: "made", label: "Passes made", render: r => r.onTrackMade, align: "right", mono: true, sort: (a, b) => a.onTrackMade - b.onTrackMade },
    { key: "suffered", label: "Passed", render: r => r.onTrackSuffered, align: "right", mono: true, sort: (a, b) => a.onTrackSuffered - b.onTrackSuffered },
    { key: "net", label: "Net", render: r => <span style={{ color: r.net > 0 ? C.pos : r.net < 0 ? C.neg : C.textMute }}>{r.net > 0 ? "+" : ""}{r.net}</span>, align: "right", mono: true, sort: (a, b) => a.net - b.net },
    { key: "all", label: "All events", render: r => `${r.made} / ${r.suffered}`, align: "right", mono: true, hideBelow: 640, title: "Including pit-cycle, lapping and safety-car swaps" },
  ];
  return (
    <Section
      id={SECTION_IDS.overtakes}
      title="Overtakes"
      hint="On-track passes only in the ranking — position swaps through the pit cycle, leaders lapping slower cars, and shuffles behind the safety car are counted but set aside."
      method={{ summary: "Each event from the timing feed is classified by what both cars were doing at that moment: under a neutralisation → 'under SC'; either car on a pit in/out lap → 'pit cycle'; a lap apart → 'lapping' or 'un-lapping'; the first lap after a restart → 'restart'; otherwise on-track." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "overtakes", filename: "openf1ow-overtakes" }}
    >
      <Gate result={result} what="overtake">
        {v => (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.textMute, marginBottom: 10 }}>
              {(Object.entries(v.totals) as [string, number][]).filter(([, n]) => n > 0).map(([k, n]) => (
                <span key={k}><b style={{ color: k === "on-track" ? C.text : C.textDim, fontFamily: "var(--mono)" }}>{n}</b> {k.replace("-", " ")}</span>
              ))}
              {v.source === "position" && <Badge tone="warn" size="sm">inferred from positions</Badge>}
            </div>
            <Table columns={columns} rows={v.byDriver.filter(r => r.made || r.suffered)} rowKey={r => r.driver.driver_number} compact defaultSort={{ key: "net", dir: "desc" }} />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function SCImpactCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? neutralisationImpact(model) : null), [model]);
  const [idx, setIdx] = useState(0);
  if (!model || !result) return null;
  if (result.ok && !result.value.length) return null;
  const columns: Column<ImpactRow>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver) },
    { key: "pos", label: "Position", render: r => `P${r.positionBefore ?? "?"} → P${r.positionAfter ?? "?"}`, mono: true },
    { key: "gained", label: "Places", render: r => <span style={{ color: (r.positionsGained ?? 0) > 0 ? C.pos : (r.positionsGained ?? 0) < 0 ? C.neg : C.textMute }}>{(r.positionsGained ?? 0) > 0 ? "+" : ""}{r.positionsGained ?? 0}</span>, align: "right", mono: true, sort: (a, b) => (a.positionsGained ?? 0) - (b.positionsGained ?? 0) },
    { key: "delta", label: "vs field", render: r => fmt.signedSec(-(r.delta ?? 0), 1), align: "right", mono: true, hideBelow: 640, title: "Gap change relative to the field's median change; positive = gained", sort: (a, b) => (a.delta ?? 0) - (b.delta ?? 0) },
    { key: "pit", label: "", render: r => (r.pittedUnder ? <Badge tone="warn" size="sm">pitted under</Badge> : null), hideBelow: 480 },
  ];
  return (
    <Section
      id={SECTION_IDS.scImpact}
      title="Safety car & red flag impact"
      hint="Running order before each neutralisation versus the first green lap after it. Gap changes are measured against the field, because everyone closes on the leader behind a safety car."
      method={{ summary: "Position and gap-to-leader on the last green lap before the window and the first green lap after. The field's median gap change is subtracted so a car's figure reads relative to the pack. A stop under the window earns the difference between a normal pit loss and the realised relative loss." }}
      actions={result.ok && result.value.length > 1 ? (
        <Segmented size="sm" role="radiogroup" ariaLabel="Window" value={String(idx)} onChange={k => setIdx(Number(k))}
          options={result.value.map((w, i) => ({ key: String(i), label: `${w.window.kind} L${w.window.lapStart}` }))} />
      ) : undefined}
      share={{ meta: "safety car impact", filename: "openf1ow-sc-impact" }}
    >
      <Gate result={result} what="neutralisation">
        {v => {
          const w = v[Math.min(idx, v.length - 1)];
          return (
            <>
              <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 10px" }}>
                <b style={{ color: C.text }}>{w.window.kind}</b> laps {w.window.lapStart}–{w.window.lapEnd} · {((w.window.tEnd - w.window.tStart) / 60000).toFixed(1)} min · {w.rows.filter(r => r.pittedUnder).length} car(s) pitted under it.
              </p>
              <Table columns={columns} rows={w.rows} rowKey={r => r.driver.driver_number} compact defaultSort={{ key: "gained", dir: "desc" }} maxHeight={420} />
            </>
          );
        }}
      </Gate>
    </Section>
  );
}

export function DirtyAirCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? dirtyAirAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<DriverTraffic>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver) },
    { key: "loss", label: "Cost / lap", render: r => (r.medianLoss == null ? <span style={{ color: C.textFaint }}>n &lt; 4</span> : <span style={{ color: r.medianLoss > 0.3 ? C.neg : C.text }}>{fmt.signedSec(r.medianLoss, 2)}</span>), align: "right", mono: true, sort: (a, b) => (a.medianLoss ?? -9) - (b.medianLoss ?? -9) },
    { key: "dirty", label: "Laps in traffic", render: r => r.dirtyLaps, align: "right", mono: true, sort: (a, b) => a.dirtyLaps - b.dirtyLaps },
    { key: "share", label: "Clear air", render: r => Math.round(r.clearShare * 100) + "%", align: "right", mono: true, hideBelow: 480, sort: (a, b) => a.clearShare - b.clearShare },
    { key: "total", label: "Total lost", render: r => (r.totalLoss != null ? r.totalLoss.toFixed(1) + " s" : "—"), align: "right", mono: true, hideBelow: 640 },
    { key: "train", label: "Longest train", render: r => (r.worstTrain ? `${r.worstTrain.laps} laps behind ${r.worstTrain.behind?.name_acronym ?? "?"}` : "—"), hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.dirtyAir}
      title="What traffic cost"
      hint="A lap counts as 'in traffic' when the car ahead was under 1.5 s away at the start of the lap, from the timing feed. Cost is against the driver's own clear-air median in the same stint."
      method={{ summary: "Gaps from /intervals at each lap start; baseline = median fuel-corrected clear-air lap of the stint (dirty laps excluded from it). Cost per lap is signed — a lap behind another car that was not slower reads negative. Needs at least 4 laps of each kind." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "traffic cost", filename: "openf1ow-dirty-air" }}
    >
      <Gate result={result} what="traffic">
        {v => (
          <>
            {v.costByGap.length > 0 && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.textMute, marginBottom: 10 }}>
                <span>Cost by gap to the car ahead:</span>
                {v.costByGap.map(b => <span key={b.bin}><b style={{ color: C.text, fontFamily: "var(--mono)" }}>{fmt.signedSec(b.medianLoss, 2)}</b> at {b.bin} <span style={{ color: C.textFaint }}>(n={b.n})</span></span>)}
              </div>
            )}
            <Table columns={columns} rows={v.drivers} rowKey={r => r.driver.driver_number} compact maxHeight={480} />
          </>
        )}
      </Gate>
    </Section>
  );
}
