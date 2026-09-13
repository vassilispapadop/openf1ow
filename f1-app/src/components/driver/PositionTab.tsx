// Race position lap by lap, from the model (position at the start of each
// lap, from the timing feed), with pit stops marked; the table of changes
// underneath keeps the lap-level detail.

import { useMemo } from "react";
import type { DriverSummary, SessionModel } from "../../engine/index.ts";
import LineChart, { type Mark } from "../../charts/LineChart";
import { Section, Table, EmptyState, type Column } from "../../ui";
import { C } from "../../lib/styles";

interface Row { lap: number; position: number; change: number; pit: boolean }

export default function PositionTab({ model, d }: { model: SessionModel; d: DriverSummary }) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: number | null = null;
    for (const l of d.laps) {
      if (l.position == null) continue;
      out.push({ lap: l.lap_number, position: l.position, change: prev == null ? 0 : prev - l.position, pit: d.pits.some(p => p.lap_number === l.lap_number) });
      prev = l.position;
    }
    return out;
  }, [d]);
  const finish = d.classification.position;
  const marks: Mark[] = d.pits.map(p => ({ x: p.lap_number ?? 0, kind: "flag" as const, label: "pit", color: "var(--warn)" })).filter(m => m.x > 0);
  const columns: Column<Row>[] = [
    { key: "lap", label: "Lap", render: r => r.lap, mono: true, width: 60 },
    { key: "pos", label: "Position", render: r => <b>P{r.position}</b>, mono: true, align: "right" },
    { key: "chg", label: "Change", render: r => (r.change === 0 ? <span style={{ color: C.textFaint }}>—</span> : <span style={{ color: r.change > 0 ? C.pos : C.neg }}>{r.change > 0 ? "▲" : "▼"}{Math.abs(r.change)}</span>), align: "right", mono: true },
    { key: "pit", label: "", render: r => (r.pit ? <span style={{ color: C.warn, fontSize: 10, fontWeight: 700 }}>PIT</span> : null), width: 50 },
  ];
  return (
    <Section
      id="position"
      title="Position through the session"
      hint="Where the car was running at the start of every lap. Flags mark pit stops; the line stops at the last timed lap."
      method={{ summary: "Position from the timing feed's position stream sampled at each lap start. In qualifying and practice this is the running order on the timing screen, not a race position." }}
      share={{ meta: `${d.driver.name_acronym} positions`, filename: "openf1ow-positions" }}
    >
      {!rows.length ? <EmptyState kind="no-data" what="position data" inline={false} /> : (
        <>
          <LineChart
            series={[{ key: String(d.driver.driver_number), label: d.driver.name_acronym, color: "#" + (d.driver.team_colour || "666"), points: rows.map(r => ({ x: r.lap, y: r.position })) }]}
            height={240}
            curve="step"
            showDots
            x={{ domain: [1, Math.max(model.totalLaps, rows[rows.length - 1].lap)], format: l => `Lap ${l}`, label: "Lap" }}
            y={{ domain: [0.5, Math.max(1, ...rows.map(r => r.position)) + 0.5], invert: true, format: v => `P${Math.round(v)}`, targetTicks: 6 }}
            marks={marks}
            format={v => `P${Math.round(v)}`}
            tipTitle={l => `Lap ${l}${finish != null && l === rows[rows.length - 1].lap ? ` · finished P${finish}` : ""}`}
            legend={false}
            rankTooltip={false}
            ariaLabel="Race position by lap"
          />
          <div style={{ marginTop: 12 }}>
            <Table columns={columns} rows={rows.filter(r => r.change !== 0 || r.pit || r.lap === 1)} rowKey={r => r.lap} compact maxHeight={360} caption="Laps where the position changed or the car pitted" />
          </div>
        </>
      )}
    </Section>
  );
}
