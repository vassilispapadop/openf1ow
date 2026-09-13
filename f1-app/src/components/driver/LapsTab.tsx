// Every lap of the driver's session with its sectors, speeds, tyre and the
// engine's flags (why a lap was not counted as clean), plus the Load / +
// actions that feed the telemetry view and the comparison.

import { useMemo } from "react";
import type { DriverSummary, EnrichedLap } from "../../engine/index.ts";
import { LapFlag, hasFlag } from "../../engine/index.ts";
import { Section, Table, Badge, type Column } from "../../ui";
import { fmt } from "../../charts/core/scales";
import { TC } from "../../lib/constants";
import { C } from "../../lib/styles";
import Pill from "../Pill";
import LineChart from "../../charts/LineChart";

const FLAG_BADGES: { flag: number; label: string; tone: "warn" | "neg" | "mute" }[] = [
  { flag: LapFlag.PIT_IN, label: "pit in", tone: "warn" }, { flag: LapFlag.PIT_OUT, label: "out-lap", tone: "warn" },
  { flag: LapFlag.SC, label: "SC", tone: "warn" }, { flag: LapFlag.VSC, label: "VSC", tone: "warn" }, { flag: LapFlag.RED, label: "red", tone: "neg" },
  { flag: LapFlag.YELLOW, label: "yellow", tone: "warn" }, { flag: LapFlag.RESTART, label: "restart", tone: "mute" }, { flag: LapFlag.OUTLIER, label: "outlier", tone: "mute" },
  { flag: LapFlag.LAPPED, label: "lapped", tone: "mute" }, { flag: LapFlag.DIRTY, label: "traffic", tone: "mute" },
];

export default function LapsTab({ d, best, comparisons, selLap, onLoadTel, onAddComparison }: {
  d: DriverSummary;
  best: EnrichedLap | null;
  comparisons: ReadonlySet<string>;
  selLap: number | null;
  onLoadTel: (lap: EnrichedLap) => void;
  onAddComparison: (lap: EnrichedLap) => void;
}) {
  const dn = d.driver.driver_number;
  const laps = d.laps;
  const clean = useMemo(() => laps.filter(l => l.clean).length, [laps]);
  const speed = (v: number | null | undefined) => (v ? <span style={{ color: C.textDim }}>{v}</span> : <span style={{ color: C.textFaint }}>—</span>);
  const columns: Column<EnrichedLap>[] = [
    { key: "lap", label: "Lap", render: l => <span style={{ fontWeight: 600, borderLeft: best && l.lap_number === best.lap_number ? "3px solid " + C.violet : "3px solid transparent", paddingLeft: 6 }}>{l.lap_number}</span>, width: 56 },
    { key: "time", label: "Time", render: l => (l.lap_duration ? <span style={{ fontWeight: 700, color: best && l.lap_number === best.lap_number ? C.violet : C.text }}>{fmt.lapTime(l.lap_duration)}</span> : <span style={{ color: C.textFaint }}>—</span>), mono: true, align: "right", sort: (a, b) => (a.lap_duration ?? Infinity) - (b.lap_duration ?? Infinity) },
    { key: "s1", label: "S1", render: l => (l.duration_sector_1 ? l.duration_sector_1.toFixed(3) : "—"), mono: true, align: "right", hideBelow: 480 },
    { key: "s2", label: "S2", render: l => (l.duration_sector_2 ? l.duration_sector_2.toFixed(3) : "—"), mono: true, align: "right", hideBelow: 480 },
    { key: "s3", label: "S3", render: l => (l.duration_sector_3 ? l.duration_sector_3.toFixed(3) : "—"), mono: true, align: "right", hideBelow: 480 },
    { key: "i1", label: "I1", render: l => speed(l.i1_speed), mono: true, align: "right", hideBelow: 900, title: "Speed at intermediate 1 (km/h)" },
    { key: "i2", label: "I2", render: l => speed(l.i2_speed), mono: true, align: "right", hideBelow: 900, title: "Speed at intermediate 2 (km/h)" },
    { key: "st", label: "Trap", render: l => speed(l.st_speed), mono: true, align: "right", hideBelow: 640, title: "Speed trap (km/h)" },
    { key: "tyre", label: "Tyre", render: l => (l.compound ? <span style={{ color: TC[l.compound] || C.textDim, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em" }}>{l.compound[0]}{l.tyreAge != null ? <span style={{ color: C.textMute, fontWeight: 500 }}> {l.tyreAge}</span> : null}</span> : <span style={{ color: C.textFaint }}>—</span>), align: "right", hideBelow: 640, title: "Compound and tyre age at the start of the lap" },
    { key: "flags", label: "Notes", render: l => {
      const b = FLAG_BADGES.filter(f => hasFlag(l.flags, f.flag)).slice(0, 3);
      return b.length ? <span style={{ display: "inline-flex", gap: 4 }}>{b.map(f => <Badge key={f.label} size="sm" tone={f.tone}>{f.label}</Badge>)}</span> : null;
    }, hideBelow: 640 },
    { key: "act", label: "", align: "right", render: l => (l.date_start && l.lap_duration ? (
      <span style={{ display: "inline-flex", gap: 4 }}>
        <Pill size="sm" variant={selLap === l.lap_number ? "inverted" : "outline"} onClick={() => onLoadTel(l)} title="Show this lap's telemetry">{selLap === l.lap_number ? "✓" : "Load"}</Pill>
        <Pill size="sm" active={comparisons.has(`${dn}-${l.lap_number}`)} disabled={comparisons.has(`${dn}-${l.lap_number}`)} onClick={() => onAddComparison(l)} title="Add this lap to the comparison">{comparisons.has(`${dn}-${l.lap_number}`) ? "✓" : "+"}</Pill>
      </span>
    ) : null) },
  ];
  const speedSeries = useMemo(() => {
    const pick = (k: "i1_speed" | "i2_speed" | "st_speed") => laps.filter(l => l[k] != null && (l[k] as number) > 0).map(l => ({ x: l.lap_number, y: l[k] as number }));
    return [
      { key: "st", label: "Speed trap", color: "#" + (d.driver.team_colour || "666"), points: pick("st_speed") },
      { key: "i1", label: "Intermediate 1", color: "#7dd3fc", points: pick("i1_speed") },
      { key: "i2", label: "Intermediate 2", color: "#fbbf24", points: pick("i2_speed") },
    ].filter(s => s.points.length >= 2);
  }, [laps, d.driver.team_colour]);

  return (
    <>
    {speedSeries.length > 0 && (
      <Section
        id="speeds"
        title="Speeds by lap"
        hint="Speed trap and intermediate readings on every lap. A step up on the trap line without a pace change is a tow or DRS; a drop late in a stint is usually lift-and-coast or a worn tyre out of the last corner."
        method={{ summary: "Readings from the timing feed's speed trap and two intermediates, per lap, as published — not from car telemetry." }}
        share={{ meta: `${d.driver.name_acronym} speeds`, filename: "openf1ow-speeds" }}
      >
        <LineChart
          series={speedSeries}
          height={220}
          curve="linear"
          showDots
          endDots={false}
          x={{ format: l => `Lap ${l}`, label: "Lap" }}
          y={{ format: v => String(Math.round(v)), targetTicks: 5, label: "km/h" }}
          format={v => Math.round(v) + " km/h"}
          tipTitle={l => `Lap ${l}`}
          legend={{ compact: true, columns: 3 }}
          rankTooltip={false}
          ariaLabel="Speed trap and intermediate speeds by lap"
        />
      </Section>
    )}
    <Section
      id="laps"
      title="Laps and sectors"
      hint={`${laps.length} laps, ${clean} of them clean. Notes say why a lap is left out of the pace figures; Load opens its telemetry, + adds it to the comparison.`}
      method={{ summary: "Lap and sector times from the timing feed. Tyre = compound and age at the start of the lap (stint feed). A lap is clean when it has a time and none of: lap 1, pit in/out, SC/VSC/red flag, ≥ 20 % under a yellow, after a retirement, or a per-stint outlier." }}
      share={{ meta: `${d.driver.name_acronym} laps`, filename: "openf1ow-laps" }}
    >
      <Table columns={columns} rows={laps} rowKey={l => l.lap_number} compact maxHeight={560} highlightKey={selLap} rowStyle={l => (l.clean ? undefined : { opacity: 0.72 })} />
    </Section>
    </>
  );
}
