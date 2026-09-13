// Strategy tab cards over the engine: the race timeline, undercut exchanges,
// tyre life per compound, and the pit crew with the real cost of a stop.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import {
  strategyTimeline, undercutAnalysis, tyreLife, pitStopAnalysis, SECTION_IDS,
  type Exchange, type TeamPitRow, type TyreLifeCurve,
} from "../../engine/index.ts";
import Timeline, { type TimelineRow } from "../../charts/Timeline";
import LineChart, { type Series } from "../../charts/LineChart";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, Badge, Segmented, type Column } from "../../ui";
import { TC } from "../../lib/constants";
import { C } from "../../lib/styles";

const BAND_COLOR: Record<string, string> = { SC: "rgba(255,181,71,0.12)", VSC: "rgba(255,181,71,0.07)", RED: "rgba(255,84,114,0.14)" };

export function StrategyTimelineCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? strategyTimeline(model) : null), [model]);
  const [hl, setHl] = useState<string | null>(null);
  if (!model || !result) return null;
  return (
    <Section
      id={SECTION_IDS.strategyTimeline}
      title="Strategy timeline"
      hint="Every driver's stints by compound, pit stops (◆, hover for the cost), and the safety-car, VSC and red-flag periods. Rows are in finishing order; retirements at the bottom."
      method={{ summary: "Stints from the tyre feed; a pit stop's on-track cost is (in-lap + out-lap) − 2 × the driver's median clear-air lap in the stints either side, fuel-corrected. Stops under a neutralisation are marked but not costed." }}
      share={{ meta: "strategy timeline", filename: "openf1ow-strategy" }}
    >
      <Gate result={result} what="stints" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.textMute, marginBottom: 8 }}>
              {v.strategies.slice(0, 5).map(s => <span key={s.label}><span style={{ color: C.text, fontWeight: 700, fontFamily: "var(--mono)" }}>{s.label}</span> × {s.count}</span>)}
            </div>
            <Timeline
              xDomain={[1, v.totalLaps]}
              highlightKey={hl}
              onRowHover={setHl}
              bands={v.bands.map(b => ({ from: b.fromLap - 0.5, to: b.toLap + 0.5, color: BAND_COLOR[b.kind], label: b.kind }))}
              rows={v.rows.map<TimelineRow>(r => ({
                key: String(r.driver.driver_number),
                label: r.driver.name_acronym,
                sub: r.finish != null ? `P${r.finish}` : r.status === "retired" ? "DNF" : "",
                dim: r.status !== "finished",
                end: r.retiredLap,
                spans: r.stints.map(s => ({
                  from: s.fromLap, to: s.toLap, color: TC[s.compound] ?? "#888", label: s.compound[0],
                  opacity: s.degOk ? 0.9 : 0.55,
                  tip: <>
                    <div style={{ fontWeight: 700 }}>{r.driver.name_acronym} · {s.compound.toLowerCase()} · L{s.fromLap}–{s.toLap}</div>
                    <div>{s.toLap - s.fromLap + 1} laps{s.tyreAgeAtStart ? `, ${s.tyreAgeAtStart} old at start` : ""}</div>
                    <div>{s.degSlope != null ? `deg ${(s.degSlope * 1000).toFixed(0)} ms/lap` : "deg: not enough clear laps"}{s.cliffAt != null ? ` · cliff at ${s.cliffAt} laps` : ""}</div>
                  </>,
                })),
                marks: r.pits.map(p => ({
                  x: p.lap, shape: "pit" as const, color: p.underNeutralisation ? C.warn : C.text, dim: p.underNeutralisation,
                  tip: <>
                    <div style={{ fontWeight: 700 }}>Pit · lap {p.lap}{p.underNeutralisation ? " · under SC/VSC" : ""}</div>
                    <div>{p.duration != null ? `${p.duration.toFixed(1)} s ${model.pitMetric === "lane" ? "pit lane" : "stationary"}` : "no time"}</div>
                    {p.loss != null && <div>cost on track ≈ {p.loss.toFixed(1)} s</div>}
                  </>,
                })),
              }))}
              ariaLabel="Strategy timeline"
            />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function UndercutCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? undercutAnalysis(model) : null), [model]);
  if (!model || !result) return null;
  const columns: Column<Exchange>[] = [
    { key: "lap", label: "Laps", render: e => `${e.firstStopLap} / ${e.secondStopLap}`, mono: true, width: 70 },
    { key: "pair", label: "Pitted first / second", render: e => <><b>{e.first.name_acronym}</b> <span style={{ color: C.textMute }}>vs</span> <b>{e.second.name_acronym}</b></> },
    { key: "before", label: "Gap before", render: e => fmt.signedSec(e.gapBefore, 1), align: "right", mono: true, hideBelow: 640, title: "First − second at the start of the first stop lap; negative = first was ahead" },
    { key: "after", label: "Gap after", render: e => fmt.signedSec(e.gapAfter, 1), align: "right", mono: true, hideBelow: 640 },
    { key: "delta", label: "Swing", render: e => <span style={{ color: e.delta < 0 ? C.pos : C.neg }}>{fmt.signedSec(-e.delta, 1)}</span>, align: "right", mono: true, sort: (a, b) => a.delta - b.delta, title: "Positive = pitting first gained" },
    { key: "result", label: "Result", render: e => <Badge tone={e.delta < 0 ? "pos" : "violet"} size="sm">{e.delta < 0 ? "undercut" : "overcut"}</Badge> },
    { key: "tyres", label: "Tyres", render: e => `${(e.compoundFirst ?? "?")[0]} / ${(e.compoundSecond ?? "?")[0]}`, mono: true, hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.undercut}
      title="Undercut vs overcut"
      hint="Every pair of cars within 3 s of each other where one pitted up to four laps before the other, and how their gap changed by the time both were on new tyres."
      method={{ summary: "Gap = difference in the two cars' lap-start timestamps. Before: the lap of the first stop. After: the lap after the second car's out-lap. Stops under a neutralisation are excluded.", caveats: ["The swing includes both pit-lane times, so a quick crew reads as part of the undercut."] }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "undercut exchanges", filename: "openf1ow-undercut" }}
    >
      <Gate result={result} what="close pit exchanges">
        {v => (
          <>
            <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 10px" }}>
              Pitting first paid off in <b style={{ color: C.text }}>{v.exchanges.filter(e => e.delta < 0).length}</b> of <b style={{ color: C.text }}>{v.undercutsTried}</b> exchanges
              {v.medianUndercutGain != null && <> · median swing <b style={{ color: C.text, fontFamily: "var(--mono)" }}>{fmt.signedSec(v.medianUndercutGain, 2)}</b> for the first stopper</>}.
            </p>
            <Table columns={columns} rows={v.exchanges} rowKey={e => `${e.first.driver_number}-${e.second.driver_number}-${e.firstStopLap}`} compact />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function TyreLifeCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? tyreLife(model) : null), [model]);
  if (!model || !result) return null;
  const series: Series[] = result.ok ? result.value.map((c: TyreLifeCurve) => ({
    key: c.compound, label: c.compound, color: TC[c.compound] ?? "#888",
    points: c.bins.map(b => ({ x: b.age, y: b.median })),
  })) : [];
  return (
    <Section
      id={SECTION_IDS.tyreLife}
      title="Tyre life by compound"
      hint="How each compound's lap time moves with tyre age, pooled across every stint in the race with a usable fit. Each point is the median over at least three stints at that age."
      method={{ summary: "For every stint with ≥ 5 clean clear-air laps, subtract the stint's fitted intercept from each fuel-corrected lap so residuals measure the tyre, not the car, then bin by tyre age. Pooled slope is an n-weighted fit over all residuals; the cliff age is the first bin whose median rises more than 0.3 s over the prior two." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "tyre life", filename: "openf1ow-tyre-life" }}
    >
      <Gate result={result} what="stints">
        {v => (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: C.textMute, marginBottom: 6 }}>
              {v.map(c => (
                <span key={c.compound}><span style={{ color: TC[c.compound] ?? C.text, fontWeight: 700 }}>{c.compound}</span>: {c.pooledSlope != null ? `${(c.pooledSlope * 1000).toFixed(0)} ms/lap` : "—"} · p90 stint {Math.round(c.p90StintLength)} laps{c.cliffAge != null ? ` · cliff ≈ ${c.cliffAge}` : ""} · {c.stints} stints</span>
              ))}
            </div>
            <LineChart
              series={series}
              height={300}
              curve="monotone"
              x={{ format: a => `${a}`, label: "Tyre age (laps)" }}
              y={{ format: y => fmt.signedSec(y, 2), includeZero: true, zeroLine: "plain", targetTicks: 5 }}
              format={y => fmt.signedSec(y, 3)}
              tipTitle={a => `Tyre age ${a} laps`}
              showDots
              endLabels
              legend={{ compact: true }}
              ariaLabel="Lap-time residual against tyre age per compound"
            />
          </>
        )}
      </Gate>
    </Section>
  );
}

export function PitCrewCard() {
  const { model } = useSessionModel();
  const result = useMemo(() => (model ? pitStopAnalysis(model) : null), [model]);
  const [view, setView] = useState<"teams" | "stops">("teams");
  if (!model || !result) return null;
  const teamCols: Column<TeamPitRow>[] = [
    { key: "team", label: "Team", render: t => <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ width: 3, height: 14, background: "#" + t.color, borderRadius: 2 }} /><b>{t.team}</b></span> },
    { key: "stops", label: "Stops", render: t => t.stops, align: "right", mono: true },
    { key: "median", label: "Median", render: t => t.medianDuration.toFixed(2) + " s", align: "right", mono: true, sort: (a, b) => a.medianDuration - b.medianDuration },
    { key: "best", label: "Best", render: t => t.best.toFixed(2), align: "right", mono: true, hideBelow: 480 },
    { key: "worst", label: "Worst", render: t => t.worst.toFixed(2), align: "right", mono: true, hideBelow: 640 },
    { key: "vs", label: "vs best", render: t => (t.vsBest === 0 ? <span style={{ color: C.pos }}>fastest</span> : "+" + t.vsBest.toFixed(2)), align: "right", mono: true },
    { key: "sc", label: "Under SC", render: t => t.underNeutralisation || "", align: "right", mono: true, hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.pitCrew}
      title="Pit stops"
      hint={result.ok ? (result.value.metric === "lane" ? "Pit-lane time per stop (the timing feed did not publish stationary times for this session). The strategy number is the on-track cost of a green-flag stop." : "Stationary time per stop, and the on-track cost of a green-flag stop.") : undefined}
      method={{ summary: "One duration metric per session: stationary time when at least half the stops have it, else pit-lane time. On-track cost = (in-lap + out-lap) − 2 × the driver's median clear-air lap around the stop, fuel-corrected; green-flag stops only." }}
      actions={<Segmented size="sm" role="radiogroup" ariaLabel="Pit view" value={view} onChange={setView} options={[{ key: "teams", label: "Crews" }, { key: "stops", label: "All stops" }]} />}
      share={{ meta: "pit stops", filename: "openf1ow-pit-stops" }}
    >
      <Gate result={result} what="pit stop">
        {v => (
          <>
            <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 10px" }}>
              {v.pitLoss.ok
                ? <>A green-flag stop cost <b style={{ color: C.text, fontFamily: "var(--mono)" }}>{v.pitLoss.value.median.toFixed(1)} s</b> on track here ({v.pitLoss.value.n} stops measured).</>
                : <>Not enough green-flag stops to measure the on-track cost of a stop.</>}
            </p>
            {view === "teams" ? (
              <Table columns={teamCols} rows={v.teams} rowKey={t => t.team} compact />
            ) : (
              <Table
                compact
                rows={v.stops.slice().sort((a, b) => a.lap_number - b.lap_number)}
                rowKey={p => `${p.driver_number}-${p.lap_number}`}
                columns={[
                  { key: "lap", label: "Lap", render: p => p.lap_number, mono: true, align: "right", width: 50 },
                  { key: "driver", label: "Driver", render: p => <b>{model.byDriver[p.driver_number]?.driver.name_acronym ?? p.driver_number}</b> },
                  { key: "dur", label: v.metric === "lane" ? "Lane" : "Stationary", render: p => (p.duration != null ? p.duration.toFixed(2) + " s" : "—"), align: "right", mono: true },
                  { key: "loss", label: "On-track cost", render: p => { const l = v.pitLoss.ok ? v.pitLoss.value.byStop.find(x => x.pit === p)?.loss : null; return l != null ? l.toFixed(1) + " s" : (p.underNeutralisation != null ? <Badge tone="warn" size="sm">SC</Badge> : "—"); }, align: "right", mono: true },
                ]}
              />
            )}
          </>
        )}
      </Gate>
    </Section>
  );
}
