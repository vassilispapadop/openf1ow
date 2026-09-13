// Race pace with the two honest views side by side: the median clean lap,
// and the same laps normalised for fuel and tyre age. Every row carries its
// sample and a 95 % interval so a 0.05 s gap on 6 laps reads as what it is.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { paceRanking, truePaceRanking, SECTION_IDS, type PaceRow } from "../../engine/index.ts";
import { Section, Segmented, Table, Gate, Badge, type Column } from "../../ui";
import { fmt } from "../../charts/core/scales";
import { C } from "../../lib/styles";

export default function TruePaceCard() {
  const { model } = useSessionModel();
  const [mode, setMode] = useState<"raw" | "true">("raw");
  const result = useMemo(() => (model ? (mode === "raw" ? paceRanking(model) : truePaceRanking(model)) : null), [model, mode]);
  if (!model || !result) return null;

  const columns: Column<PaceRow & { rank: number }>[] = [
    { key: "rank", label: "#", render: r => r.rank, align: "right", mono: true, width: 36 },
    { key: "driver", label: "Driver", render: r => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (r.driver.team_colour || "666") }} />
        <span style={{ fontWeight: 700 }}>{r.driver.name_acronym}</span>
        <span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{r.team}</span>
      </span>
    ) },
    { key: "median", label: mode === "raw" ? "Median lap" : "Normalised", render: r => fmt.lapTime(mode === "raw" ? r.medianRaw : r.medianPace), align: "right", mono: true, sort: (a, b) => a.medianPace - b.medianPace },
    { key: "gap", label: "Gap", render: r => (r.gapToFastest === 0 ? <span style={{ color: C.pos }}>fastest</span> : fmt.signedSec(r.gapToFastest)), align: "right", mono: true, sort: (a, b) => a.gapToFastest - b.gapToFastest },
    { key: "ci", label: "95 % interval", render: r => `±${((r.ci95[1] - r.ci95[0]) / 2).toFixed(3)}`, align: "right", mono: true, hideBelow: 640, title: "Bootstrap interval of the median" },
    { key: "sigma", label: "σ", render: r => r.consistency.toFixed(3), align: "right", mono: true, hideBelow: 900, sort: (a, b) => a.consistency - b.consistency },
    { key: "n", label: "Laps", render: r => r.n, align: "right", mono: true, hideBelow: 480 },
    { key: "status", label: "", render: r => {
      const d = model.byDriver[r.driver.driver_number];
      return d.classification.status === "retired" ? <Badge tone="neg" size="sm">out L{d.classification.retiredLap}</Badge> : null;
    }, hideBelow: 640 },
  ];

  const gated = result.ok
    ? result.value.rows.filter(g => !g.ok).length
    : 0;

  return (
    <Section
      id={SECTION_IDS.truePace}
      title="Race pace"
      hint={mode === "raw"
        ? "Median lap on clean racing laps — no lap 1, pit laps, safety-car or yellow-flag laps, retired cars' trailing laps, or per-stint outliers. Fuel-corrected to race-end load for the gap."
        : "The same clean laps in clear air, normalised to tyre age 10 with each stint's fitted degradation — what the car could do on equal tyres and fuel."}
      method={{
        summary: "A lap counts when it has a time and none of: lap 1, pit in/out, SC/VSC/red flag, ≥20 % under a sector yellow, after a retirement, or more than 3 MAD above its stint's median (fuel-corrected). Raw pace is the median of those; true pace also requires clear air (≥1.5 s to the car ahead from the timing feed) and removes tyre age with the stint's own fitted slope.",
        steps: [`Minimum ${5} laps per driver; the interval is a 1 000-sample bootstrap of the median.`, `Fuel effect: ${model.fuel.secPerKg.toFixed(3)} s/kg (${model.fuel.source}).`],
        caveats: gated ? [`${gated} driver${gated === 1 ? "" : "s"} below the minimum sample are listed without a figure.`] : undefined,
      }}
      confidence={result.ok ? result.confidence : undefined}
      actions={<Segmented size="sm" role="radiogroup" ariaLabel="Pace view" value={mode} onChange={setMode} options={[{ key: "raw", label: "Clean laps" }, { key: "true", label: "Equal tyres" }]} />}
      share={{ meta: `${model.meeting?.meeting_name ?? ""} race pace`, filename: "openf1ow-race-pace" }}
    >
      <Gate result={result} what="race pace" inline={false}>
        {v => (
          <>
            <Table
              columns={columns}
              rows={v.ranked.map((r, i) => ({ ...r, rank: i + 1 }))}
              rowKey={r => r.driver.driver_number}
              compact
            />
            {v.rows.some(g => !g.ok) && (
              <p style={{ fontSize: 11, color: C.textFaint, margin: "10px 4px 0" }}>
                Not enough laps: {v.rows.filter(g => !g.ok).map((g, i) => {
                  const d = model.drivers[i];
                  return `${d?.driver.name_acronym ?? "?"} (${g.ok ? "" : g.n})`;
                }).join(", ")}.
              </p>
            )}
          </>
        )}
      </Gate>
    </Section>
  );
}
