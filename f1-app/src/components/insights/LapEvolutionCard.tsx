// Every driver's lap time, lap by lap, with the race's neutralisations
// shaded and pit laps left out of the lines. The y range is capped at the
// field median × 1.08 so a safety-car lap doesn't flatten everything else.

import { useMemo } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { LapFlag, hasFlag, SECTION_IDS } from "../../engine/index.ts";
import { median } from "../../engine/stats.ts";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt } from "../../charts/core/scales";
import { Section } from "../../ui";
import { isSecondDriverOfTeam } from "./DeltaTraceCard";
import { useSelection } from "../../contexts/SelectionContext";

const BAND_COLOR: Record<string, string> = { SC: "rgba(255,181,71,0.10)", VSC: "rgba(255,181,71,0.06)", RED: "rgba(255,84,114,0.12)" };
const CAP = 1.08;

export default function LapEvolutionCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const built = useMemo(() => {
    if (!model || model.kind !== "race") return null;
    const timed = model.laps.filter(l => l.lap_duration && l.lap_duration > 0 && !hasFlag(l.flags, LapFlag.PIT_IN | LapFlag.PIT_OUT | LapFlag.LAP1));
    if (!timed.length) return null;
    const cap = median(timed.map(l => l.lap_duration as number)) * CAP;
    const series: Series[] = model.drivers
      .slice()
      .sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99))
      .map(d => ({
        key: String(d.driver.driver_number),
        label: d.driver.name_acronym,
        color: "#" + (d.driver.team_colour || "666"),
        dash: isSecondDriverOfTeam(model, d.driver.driver_number),
        points: d.laps
          .filter(l => l.lap_duration && l.lap_duration > 0 && l.lap_duration <= cap && !hasFlag(l.flags, LapFlag.PIT_IN | LapFlag.PIT_OUT | LapFlag.LAP1))
          .map(l => ({ x: l.lap_number, y: l.lap_duration as number })),
        rank: d.classification.position ?? 99,
      }))
      .filter(s => s.points.length >= 2);
    const bands = model.neutralisations.filter(n => n.kind !== "YELLOW").map(n => ({ from: n.lapStart - 0.5, to: n.lapEnd + 0.5, color: BAND_COLOR[n.kind], label: n.kind }));
    const lo = Math.min(...timed.map(l => l.lap_duration as number));
    return { series, bands, domain: [lo - 0.3, cap] as [number, number], focus: new Set(series.slice(0, 6).map(s => s.key)), totalLaps: model.totalLaps };
  }, [model]);
  if (!model || !built) return null;

  return (
    <Section
      id={SECTION_IDS.lapEvolution}
      title="Lap-time evolution"
      hint="Every driver's lap time, lap by lap. Pit in/out laps and lap 1 are left out; laps slower than 8 % over the field median (safety car, damage) fall outside the frame. Bands mark safety-car, VSC and red-flag periods."
      method={{ summary: "Raw lap durations from the timing feed. Teammates share a colour; the second car of each team is dashed. Hover for the full order on any lap; click a legend entry to hide it, alt-click to isolate." }}
      share={{ meta: "lap-time evolution", filename: "openf1ow-lap-evolution" }}
    >
      <LineChart
        series={built.series}
        height={400}
        curve="linear"
        x={{ domain: [1, built.totalLaps], format: l => `Lap ${l}`, label: "Lap" }}
        y={{ domain: built.domain, format: y => fmt.lapTime(y), zeroLine: false, targetTicks: 6 }}
        bands={built.bands}
        focus={sel.focusKeys ?? built.focus}
        hovered={sel.hoveredKey}
        onHover={k => sel.setHovered(k ? Number(k) : null)}
        onSelect={k => sel.toggle(Number(k))}
        format={y => fmt.lapTime(y)}
        tipTitle={l => `Lap ${l}`}
        endDots={false}
        legend={{ columns: 2, compact: true, hint: true }}
        ariaLabel="Lap times by lap for every driver"
      />
    </Section>
  );
}
