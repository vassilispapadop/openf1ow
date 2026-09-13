// Build a lap comparison without leaving the page: pick any driver and any
// of their timed laps, or take the one-click shortcuts an engineer reaches
// for first — my best, my teammate's best, the winner's (or pole) best.

import { useMemo, useState } from "react";
import type { SessionModel, EnrichedLap } from "../../engine/index.ts";
import { bestLapFor } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import Pill from "../Pill";
import { C } from "../../lib/styles";

export default function CompareBuilder({ model, currentDn, existing, onAdd }: {
  model: SessionModel;
  currentDn: number;
  existing: ReadonlySet<string>;              // "dn-lap" ids already compared
  onAdd: (driverNumber: number, lap: EnrichedLap) => void;
}) {
  const drivers = useMemo(() => model.drivers.slice().sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99)), [model]);
  const [dn, setDn] = useState<number>(currentDn);
  const [lapNo, setLapNo] = useState<number | "best">("best");
  const d = model.byDriver[dn] ?? model.byDriver[currentDn];
  const timed = useMemo(() => (d?.laps ?? []).filter(l => l.date_start && l.lap_duration && l.lap_duration > 0), [d]);
  const best = d ? bestLapFor(model, d.driver.driver_number) : null;
  const chosen = lapNo === "best" ? best : timed.find(l => l.lap_number === lapNo) ?? null;

  const me = model.byDriver[currentDn];
  const mate = me ? model.teams[me.team]?.drivers.find(x => x.driver_number !== currentDn) : null;
  const leader = model.kind === "race" ? model.drivers.find(x => x.classification.position === 1) : null;
  const quick: { label: string; dn: number }[] = [];
  if (me) quick.push({ label: "My best", dn: currentDn });
  if (mate) quick.push({ label: `${mate.name_acronym}'s best`, dn: mate.driver_number });
  if (leader && leader.driver.driver_number !== currentDn && leader.driver.driver_number !== mate?.driver_number) quick.push({ label: `Winner's best (${leader.driver.name_acronym})`, dn: leader.driver.driver_number });
  if (model.kind !== "race") {
    // Pole / fastest lap of the session.
    let top: { dn: number; t: number } | null = null;
    for (const x of model.drivers) { const b = bestLapFor(model, x.driver.driver_number); if (b && (!top || (b.lap_duration as number) < top.t)) top = { dn: x.driver.driver_number, t: b.lap_duration as number }; }
    if (top && top.dn !== currentDn && top.dn !== mate?.driver_number) quick.push({ label: `${model.kind === "qualifying" ? "Pole" : "Fastest"} lap (${model.byDriver[top.dn].driver.name_acronym})`, dn: top.dn });
  }
  const addBest = (who: number) => { const b = bestLapFor(model, who); if (b) onAdd(who, b); };
  const has = (who: number, lap: EnrichedLap | null) => !!lap && existing.has(`${who}-${lap.lap_number}`);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <select value={dn} onChange={e => { setDn(Number(e.target.value)); setLapNo("best"); }} style={sel} aria-label="Driver to compare">
        {drivers.map(x => <option key={x.driver.driver_number} value={x.driver.driver_number}>{x.classification.position ? `P${x.classification.position} · ` : ""}{x.driver.name_acronym} · {x.team}</option>)}
      </select>
      <select value={lapNo} onChange={e => setLapNo(e.target.value === "best" ? "best" : Number(e.target.value))} style={sel} aria-label="Lap to compare">
        {best && <option value="best">Best · L{best.lap_number} · {fmt.lapTime(best.lap_duration as number)}</option>}
        {timed.map(l => <option key={l.lap_number} value={l.lap_number}>L{l.lap_number} · {fmt.lapTime(l.lap_duration as number)}{l.compound ? ` · ${l.compound[0]}${l.tyreAge != null ? l.tyreAge : ""}` : ""}{l.is_pit_out_lap ? " · out-lap" : ""}</option>)}
      </select>
      <Pill size="sm" variant="inverted" disabled={!chosen || has(dn, chosen)} onClick={() => chosen && onAdd(dn, chosen)} title="Add this lap to the comparison">
        {chosen && has(dn, chosen) ? "Added" : "+ Add lap"}
      </Pill>
      <span style={{ width: 1, height: 18, background: C.border, margin: "0 2px" }} />
      {quick.map(q => {
        const b = bestLapFor(model, q.dn);
        return <Pill key={q.label} size="sm" disabled={!b || has(q.dn, b)} onClick={() => addBest(q.dn)} title={b ? `L${b.lap_number} · ${fmt.lapTime(b.lap_duration as number)}` : "no timed lap"}>{q.label}</Pill>;
      })}
    </div>
  );
}

const sel: React.CSSProperties = {
  background: C.surfaceAlt, color: C.text, border: "1px solid " + C.border, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font)", maxWidth: 260,
};
