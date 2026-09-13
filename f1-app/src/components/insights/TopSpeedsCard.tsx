// Top speeds for any session: speed trap (clear air vs tow when the timing
// intervals allow) and the two intermediates, per driver, with the field's
// and each team's best on top. Bound to the shared driver selection.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { topSpeeds, SECTION_IDS, type DriverSpeeds, type TeamSpeeds } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, StatTile, Segmented, type Column } from "../../ui";
import { C } from "../../lib/styles";
import { useSelection } from "../../contexts/SelectionContext";

const kph = (r: { speed: number; lap: number } | null, withLap = true) => (r
  ? <span>{Math.round(r.speed)}<span style={{ color: C.textMute, fontSize: 10 }}> km/h{withLap ? ` · L${r.lap}` : ""}</span></span>
  : <span style={{ color: C.textFaint }}>—</span>);

export default function TopSpeedsCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const [view, setView] = useState<"drivers" | "teams">("drivers");
  const result = useMemo(() => (model ? topSpeeds(model) : null), [model]);
  if (!model || !result) return null;
  const towSplit = result.ok && result.value.towSplit;
  const maxTrap = result.ok ? Math.max(1, ...result.value.drivers.map(r => r.trap?.speed ?? 0)) : 1;
  const minTrap = result.ok ? Math.min(...result.value.drivers.map(r => r.trap?.speed ?? Infinity)) : 0;
  const bar = (v: number | undefined, colour: string) => (v == null ? null : (
    <span className="hide-narrow" style={{ display: "inline-block", width: 80, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden", verticalAlign: "middle", marginRight: 8 }}>
      <span style={{ display: "block", width: `${Math.max(3, ((v - minTrap + 3) / Math.max(1, maxTrap - minTrap + 3)) * 100)}%`, height: "100%", background: colour, borderRadius: 4, opacity: 0.85 }} />
    </span>
  ));

  const driverCols: Column<DriverSpeeds>[] = [
    { key: "rank", label: "#", render: (_r, i) => i + 1, mono: true, align: "right", width: 36 },
    { key: "driver", label: "Driver", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.driver.team_colour || "666") }} /><b>{r.driver.name_acronym}</b><span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{r.team}</span></span> },
    { key: "trap", label: "Speed trap", render: r => <span>{bar(r.trap?.speed, "#" + (r.driver.team_colour || "666"))}{kph(r.trap)}</span>, mono: true, align: "right", sort: (a, b) => (a.trap?.speed ?? 0) - (b.trap?.speed ?? 0) },
    ...(towSplit ? [
      { key: "clear", label: "Clear air", render: (r: DriverSpeeds) => kph(r.trapClear), mono: true, align: "right" as const, hideBelow: 640 as const, sort: (a: DriverSpeeds, b: DriverSpeeds) => (a.trapClear?.speed ?? 0) - (b.trapClear?.speed ?? 0), title: "Best reading with ≥ 1.5 s to the car ahead (or gap unknown)" },
      { key: "tow", label: "In a tow", render: (r: DriverSpeeds) => kph(r.trapTow), mono: true, align: "right" as const, hideBelow: 640 as const, sort: (a: DriverSpeeds, b: DriverSpeeds) => (a.trapTow?.speed ?? 0) - (b.trapTow?.speed ?? 0), title: "Best reading within 1.0 s of the car ahead" },
    ] : []),
    { key: "median", label: "Median", render: r => (r.trapMedian != null ? Math.round(r.trapMedian) : "—"), mono: true, align: "right", hideBelow: 900, sort: (a, b) => (a.trapMedian ?? 0) - (b.trapMedian ?? 0), title: "Median trap reading over the laps with one" },
    { key: "i1", label: "I1", render: r => kph(r.i1, false), mono: true, align: "right", hideBelow: 900, sort: (a, b) => (a.i1?.speed ?? 0) - (b.i1?.speed ?? 0), title: "Best speed at intermediate 1" },
    { key: "i2", label: "I2", render: r => kph(r.i2, false), mono: true, align: "right", hideBelow: 900, sort: (a, b) => (a.i2?.speed ?? 0) - (b.i2?.speed ?? 0), title: "Best speed at intermediate 2" },
    { key: "n", label: "Laps", render: r => r.n, mono: true, align: "right", hideBelow: 480 },
  ];
  const teamCols: Column<TeamSpeeds>[] = [
    { key: "rank", label: "#", render: (_r, i) => i + 1, mono: true, align: "right", width: 36 },
    { key: "team", label: "Team", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.color || "666") }} /><b>{r.team}</b></span> },
    { key: "trap", label: "Best trap", render: r => <span>{bar(r.trap?.speed, "#" + (r.color || "666"))}{kph(r.trap)}</span>, mono: true, align: "right", sort: (a, b) => (a.trap?.speed ?? 0) - (b.trap?.speed ?? 0) },
    { key: "by", label: "Set by", render: r => (r.trap ? <b>{r.trap.driver.name_acronym}</b> : "—") },
  ];

  const quali = model.kind !== "race";
  return (
    <Section
      id={SECTION_IDS.topSpeeds}
      title="Top speeds"
      hint={quali
        ? "Speed trap and intermediate speeds over the session's timed laps — which car has the straight-line speed, and who set the fastest readings."
        : "Speed trap and intermediate speeds over the race. A car in a tow reads several km/h quicker than the same car in clear air, so the two are ranked apart where the timing intervals allow."}
      method={{
        summary: `Readings from the timing feed's speed trap and intermediates on timed laps, excluding safety-car, VSC and red-flag laps. ${towSplit ? "Clear air = ≥ 1.5 s to the car ahead at the start of the lap (or gap unknown); tow = within 1.0 s." : "Intervals are not available, so readings are not split by traffic."} Team best = the quicker of its drivers.`,
        caveats: result.ok ? result.notes : undefined,
      }}
      confidence={result.ok ? result.confidence : undefined}
      actions={<Segmented size="sm" role="radiogroup" ariaLabel="Top speeds by" value={view} onChange={setView} options={[{ key: "drivers", label: "Drivers" }, { key: "teams", label: "Teams" }]} />}
      share={{ meta: "top speeds", filename: "openf1ow-top-speeds" }}
    >
      <Gate result={result} what="speed readings" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              {v.fieldBest.trap && <StatTile grow label="Fastest through the trap" value={fmt.kph(v.fieldBest.trap.speed)} mono teamColor={"#" + (v.fieldBest.trap.driver.team_colour || "666")} sub={`${v.fieldBest.trap.driver.name_acronym} · lap ${v.fieldBest.trap.lap}`} />}
              {v.fieldBest.i1 && <StatTile grow label="Intermediate 1" value={fmt.kph(v.fieldBest.i1.speed)} mono teamColor={"#" + (v.fieldBest.i1.driver.team_colour || "666")} sub={`${v.fieldBest.i1.driver.name_acronym} · lap ${v.fieldBest.i1.lap}`} />}
              {v.fieldBest.i2 && <StatTile grow label="Intermediate 2" value={fmt.kph(v.fieldBest.i2.speed)} mono teamColor={"#" + (v.fieldBest.i2.driver.team_colour || "666")} sub={`${v.fieldBest.i2.driver.name_acronym} · lap ${v.fieldBest.i2.lap}`} />}
              {v.teams.length > 1 && v.teams[0].trap && v.teams[v.teams.length - 1].trap && (
                <StatTile grow label="Team spread" value={`${Math.round(v.teams[0].trap.speed - (v.teams[v.teams.length - 1].trap as { speed: number }).speed)} km/h`} mono sub={`${v.teams[0].team} to ${v.teams[v.teams.length - 1].team}`} />
              )}
            </div>
            {view === "drivers"
              ? <Table columns={driverCols} rows={v.drivers} rowKey={r => r.driver.driver_number} compact maxHeight={560} highlightKeys={sel.selected} dimOthers onRowClick={r => sel.toggle(r.driver.driver_number)} onRowHover={r => sel.setHovered(r ? r.driver.driver_number : null)} />
              : <Table columns={teamCols} rows={v.teams} rowKey={r => r.team} compact
                  highlightKeys={new Set(v.teams.filter(t => t.trap && sel.selected.has(t.trap.driver.driver_number)).map(t => t.team))} dimOthers={sel.selected.size > 0}
                  onRowClick={r => r.trap && sel.toggle(r.trap.driver.driver_number)} onRowHover={r => sel.setHovered(r?.trap ? r.trap.driver.driver_number : null)} />}
          </>
        )}
      </Gate>
    </Section>
  );
}
