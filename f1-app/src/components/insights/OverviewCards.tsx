// Overview cards over the engine: the start, and how grid and pace turned
// into the result.

import { useMemo } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { startAnalysis, conversionAnalysis, SECTION_IDS, type StartRow, type ConversionRow } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, Badge, type Column } from "../../ui";
import { C } from "../../lib/styles";

const drv = (d: { name_acronym: string; team_colour: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 3, height: 13, borderRadius: 2, background: "#" + (d.team_colour || "666") }} /><b>{d.name_acronym}</b>
  </span>
);
const signed = (v: number | null) => (v == null ? "—" : <span style={{ color: v > 0 ? C.pos : v < 0 ? C.neg : C.textMute }}>{v > 0 ? "+" : ""}{v}</span>);

export function StartCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? startAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<StartRow>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver) },
    { key: "grid", label: "Grid", render: r => (r.grid != null ? `P${r.grid}` : r.pitLaneStart ? "pit lane" : "—"), mono: true, align: "right" },
    { key: "l1", label: "After lap 1", render: r => (r.afterLap1 != null ? `P${r.afterLap1}` : "—"), mono: true, align: "right" },
    { key: "g1", label: "Places", render: r => signed(r.gainedLap1), mono: true, align: "right", sort: (a, b) => (a.gainedLap1 ?? -99) - (b.gainedLap1 ?? -99) },
    { key: "l5", label: "After lap 5", render: r => (r.afterLap5 != null ? `P${r.afterLap5}` : "—"), mono: true, align: "right", hideBelow: 640 },
    { key: "g5", label: "Places", render: r => signed(r.gainedPhase), mono: true, align: "right", hideBelow: 640, sort: (a, b) => (a.gainedPhase ?? -99) - (b.gainedPhase ?? -99) },
    { key: "t1", label: "Lap 1 vs field", render: r => (r.lap1VsField != null ? fmt.signedSec(r.lap1VsField, 1) : "—"), mono: true, align: "right", hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.start}
      title="The start"
      hint="Grid position against the running order at the end of lap 1 and of lap 5. Lap 1 is analysed here — it is excluded from pace everywhere else, not thrown away."
      method={{ summary: "Grid from the starting-grid feed (published against the qualifying session), else the position feed before lights out. Positions after laps 1 and 5 from the position feed at the start of laps 2 and 6.", caveats: result.ok && result.notes ? result.notes : undefined }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "the start", filename: "openf1ow-start" }}
    >
      <Gate result={result} what="grid">
        {v => (
          <>
            {v.incidents.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {v.incidents.slice(0, 4).map((m, i) => <Badge key={i} tone="warn" size="sm">L{m.lap ?? "?"} · {m.message.toLowerCase()}</Badge>)}
              </div>
            )}
            <Table columns={columns} rows={v.rows} rowKey={r => r.driver.driver_number} compact defaultSort={{ key: "g1", dir: "desc" }} maxHeight={460} />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function GridFinishCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? conversionAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<ConversionRow>[] = [
    { key: "finish", label: "Finish", render: r => (r.finish != null ? `P${r.finish}` : <Badge tone="neg" size="sm">{r.status}</Badge>), mono: true, align: "right", width: 60 },
    { key: "driver", label: "Driver", render: r => drv(r.driver) },
    { key: "grid", label: "Grid", render: r => (r.grid != null ? `P${r.grid}` : "—"), mono: true, align: "right" },
    { key: "gf", label: "Grid → finish", render: r => signed(r.gridToFinish), mono: true, align: "right", sort: (a, b) => (a.gridToFinish ?? -99) - (b.gridToFinish ?? -99) },
    { key: "pace", label: "Pace rank", render: r => (r.paceRank != null ? `P${r.paceRank}` : "—"), mono: true, align: "right", hideBelow: 480 },
    { key: "pf", label: "Pace → finish", render: r => signed(r.paceToFinish), mono: true, align: "right", hideBelow: 480, sort: (a, b) => (a.paceToFinish ?? -99) - (b.paceToFinish ?? -99), title: "Finished better (+) or worse (−) than the fuel-corrected pace rank" },
  ];
  return (
    <Section
      id={SECTION_IDS.gridFinish}
      title="Grid, pace and result"
      hint="Who converted a grid slot or a fast car into a result, and who didn't. Pace rank is the fuel-corrected clean-lap median."
      method={{ summary: "Classification from the timing feed. Pace → finish compares the finishing position with the driver's rank in the race-pace table; strategy, track position and others' misfortune make up the difference." }}
      share={{ meta: "grid, pace and result", filename: "openf1ow-conversion" }}
    >
      <Gate result={result} what="classification">
        {v => <Table columns={columns} rows={v.rows} rowKey={r => r.driver.driver_number} compact maxHeight={520} />}
      </Gate>
    </Section>
  );
}
