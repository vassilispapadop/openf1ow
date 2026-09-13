// Pace-tab cards over the engine: sectors with one meaning per word, and
// consistency as one sample σ with a robust σ beside it. Both bound to the
// shared driver selection.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { sectorAnalysis, consistencyByDriver, SECTION_IDS, GATES, type SectorRow, type ConsistencyRow } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, StatTile, Segmented, type Column } from "../../ui";
import { C } from "../../lib/styles";
import { useSelection } from "../../contexts/SelectionContext";

const PURPLE = "#a855f7";

const drv = (d: { name_acronym: string; team_colour: string }, team?: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (d.team_colour || "666") }} />
    <span style={{ fontWeight: 700 }}>{d.name_acronym}</span>
    {team && <span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{team}</span>}
  </span>
);

function useBind<R>(key: (r: R) => number) {
  const sel = useSelection();
  return { highlightKeys: sel.selected, dimOthers: true, onRowClick: (r: R) => sel.toggle(key(r)), onRowHover: (r: R | null) => sel.setHovered(r ? key(r) : null) } as const;
}

export function SectorsCard() {
  const { model } = useSessionModel();
  const bind = useBind<SectorRow>(r => r.driver.driver_number);
  const [mode, setMode] = useState<"median" | "best">("median");
  const result = useMemo(() => (model ? sectorAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const delta = (v: number) => (Math.abs(v) < 5e-4 ? <span style={{ color: PURPLE, fontWeight: 700 }}>best</span> : <span style={{ color: v > 0.3 ? C.neg : undefined }}>+{v.toFixed(3)}</span>);
  const sec = (r: SectorRow, i: 0 | 1 | 2) => mode === "median" ? delta(r.deltas[i]) : <span style={{ color: result.ok && Math.abs(r.bests[i] - result.value.fieldBestSectors[i]) < 5e-4 ? PURPLE : undefined }}>{r.bests[i].toFixed(3)}</span>;
  const columns: Column<SectorRow>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver, r.team) },
    { key: "s1", label: mode === "median" ? "S1 Δ" : "Best S1", render: r => sec(r, 0), mono: true, align: "right", sort: (a, b) => (mode === "median" ? a.deltas[0] - b.deltas[0] : a.bests[0] - b.bests[0]) },
    { key: "s2", label: mode === "median" ? "S2 Δ" : "Best S2", render: r => sec(r, 1), mono: true, align: "right", sort: (a, b) => (mode === "median" ? a.deltas[1] - b.deltas[1] : a.bests[1] - b.bests[1]) },
    { key: "s3", label: mode === "median" ? "S3 Δ" : "Best S3", render: r => sec(r, 2), mono: true, align: "right", sort: (a, b) => (mode === "median" ? a.deltas[2] - b.deltas[2] : a.bests[2] - b.bests[2]) },
    { key: "tot", label: "Total Δ", render: r => (r.totalDelta < 5e-4 ? <span style={{ color: C.pos }}>fastest</span> : "+" + r.totalDelta.toFixed(3)), mono: true, align: "right", sort: (a, b) => a.totalDelta - b.totalDelta, title: "Sum of the three median deltas to the field's best median" },
    { key: "theo", label: "Theoretical", render: r => fmt.lapTime(r.theoretical), mono: true, align: "right", hideBelow: 640, sort: (a, b) => a.theoretical - b.theoretical, title: "Own best three sectors summed" },
    { key: "cov", label: "CoV", render: r => (r.cov.reduce((s, v) => s + v, 0) / 3 * 100).toFixed(2) + " %", mono: true, align: "right", hideBelow: 900, sort: (a, b) => a.cov.reduce((s, v) => s + v, 0) - b.cov.reduce((s, v) => s + v, 0), title: "Mean sector coefficient of variation (σ / mean)" },
    { key: "trap", label: "Trap clear", render: r => (r.trapClear != null ? fmt.kph(r.trapClear) : "—"), mono: true, align: "right", hideBelow: 900, sort: (a, b) => (a.trapClear ?? 0) - (b.trapClear ?? 0), title: "Best speed-trap reading with ≥ 1.5 s to the car ahead" },
    { key: "tow", label: "In tow", render: r => (r.trapTow != null ? fmt.kph(r.trapTow) : <span style={{ color: C.textFaint }}>—</span>), mono: true, align: "right", hideBelow: 900, title: "Best speed-trap reading within 1.0 s of the car ahead" },
    { key: "n", label: "Laps", render: r => r.n, mono: true, align: "right", hideBelow: 480 },
  ];
  return (
    <Section
      id={SECTION_IDS.sectors}
      title="Sectors"
      hint={<>Where each driver gains or loses time. Median sector on clean laps against the field's best median; <span style={{ color: PURPLE }}>purple</span> marks the field's best. Speed traps are split by traffic, because a tow is a tow.</>}
      method={{
        summary: `Clean laps with all three sectors, at least ${GATES.SECTOR_MIN} per driver. Δ = own median sector − field's best median sector. Theoretical = own best sectors summed (the field's ultimate lap is shown separately). CoV = sample σ / mean per sector.`,
      }}
      confidence={result.ok ? result.confidence : undefined}
      actions={<Segmented size="sm" role="radiogroup" ariaLabel="Sector view" value={mode} onChange={setMode} options={[{ key: "median", label: "Median Δ" }, { key: "best", label: "Best" }]} />}
      share={{ meta: "sectors", filename: "openf1ow-sectors" }}
    >
      <Gate result={result} what="sector times" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <StatTile grow label="Ultimate lap" value={fmt.lapTime(v.ultimateLap)} mono accent={PURPLE} sub="field's best sectors summed" />
              {v.kings.map((k, i) => <StatTile key={i} grow label={`Sector ${i + 1}`} value={k.name_acronym} teamColor={"#" + (k.team_colour || "666")} sub={`median ${v.fieldBestMedians[i].toFixed(3)} s`} />)}
            </div>
            <Table columns={columns} rows={v.rows} rowKey={r => r.driver.driver_number} compact maxHeight={560} {...bind} />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function ConsistencyCard() {
  const { model } = useSessionModel();
  const bind = useBind<ConsistencyRow>(r => r.driver.driver_number);
  const result = useMemo(() => (model ? consistencyByDriver(model) : null), [model]);
  if (!model || !result) return null;
  const max = result.ok ? Math.max(...result.value.map(r => r.sigma)) : 1;
  const bar = (v: number, colour: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "flex-end" }}>
      <span style={{ flex: "0 0 90px", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }} className="hide-narrow">
        <span style={{ display: "block", width: `${Math.max(2, (v / max) * 100)}%`, height: "100%", background: colour, borderRadius: 4 }} />
      </span>
      <span>{v.toFixed(3)}</span>
    </span>
  );
  const tone = (v: number) => (v < 0.3 ? C.pos : v < 0.6 ? C.warn : C.neg);
  const columns: Column<ConsistencyRow>[] = [
    { key: "rank", label: "#", render: (_r, i) => i + 1, mono: true, align: "right", width: 36 },
    { key: "driver", label: "Driver", render: r => drv(r.driver, r.team) },
    { key: "sigma", label: "σ", render: r => bar(r.sigma, tone(r.sigma)), mono: true, align: "right", sort: (a, b) => a.sigma - b.sigma, title: "Sample standard deviation of clean clear-air fuel-corrected laps" },
    { key: "robust", label: "Robust σ", render: r => r.robustSigma.toFixed(3), mono: true, align: "right", hideBelow: 640, sort: (a, b) => a.robustSigma - b.robustSigma, title: "1.4826 × median absolute deviation — one bad lap does not move it" },
    { key: "median", label: "Median", render: r => fmt.lapTime(r.median), mono: true, align: "right", hideBelow: 900 },
    { key: "clean", label: "Clean", render: r => Math.round(r.cleanShare * 100) + " %", mono: true, align: "right", hideBelow: 480, sort: (a, b) => a.cleanShare - b.cleanShare, title: "Share of racing laps that were clean" },
    { key: "n", label: "Laps", render: r => r.n, mono: true, align: "right", hideBelow: 480 },
  ];
  return (
    <Section
      id={SECTION_IDS.consistency}
      title="Consistency"
      hint="How tightly each driver's lap times cluster once fuel is taken out — lower is more metronomic. The robust σ ignores a single off lap; when the two differ a lot, something happened on one lap."
      method={{ summary: `Clean, clear-air laps only (≥ ${GATES.CONSISTENCY_MIN}), fuel-corrected to race-end load. σ is the sample standard deviation; robust σ is 1.4826 × MAD. Clean share = clean laps over timed racing laps (lap 1 and neutralised laps excluded from both).` }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "consistency", filename: "openf1ow-consistency" }}
    >
      <Gate result={result} what="consistency" inline={false}>
        {v => <Table columns={columns} rows={v} rowKey={r => r.driver.driver_number} compact maxHeight={520} {...bind} />}
      </Gate>
    </Section>
  );
}
