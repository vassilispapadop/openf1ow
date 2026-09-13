// Cards for qualifying and practice, over the engine's single-lap analyses.
// Everything is on the session clock (minutes since the first timed lap)
// and bound to the shared driver selection.

import { useMemo, useState } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import {
  bestLapsByDriver, sessionClock, pushLaps, trackEvolution, sectorBests, teammateSingleLap, runPlan, longRuns, compoundPrograms,
  SECTION_IDS, PUSH_LAP_FACTOR, TRACK_EVOLUTION_MIN_LAPS, TRACK_EVOLUTION_MIN_DRIVERS,
  type BestLapRow, type SectorBestRow, type SingleLapPair, type LongRun, type CompoundProgram, type SessionModel,
} from "../../engine/index.ts";
import LineChart, { type Series } from "../../charts/LineChart";
import Timeline, { type TimelineRow } from "../../charts/Timeline";
import { fmt } from "../../charts/core/scales";
import { Section, Gate, Table, Badge, StatTile, Segmented, type Column } from "../../ui";
import { C, M } from "../../lib/styles";
import { TC } from "../../lib/constants";
import { podiumColor } from "../../lib/format";
import { useSelection } from "../../contexts/SelectionContext";
import { isSecondDriverOfTeam } from "./DeltaTraceCard";
import TrackMap from "../session/TrackMap";
import CornerAnalysis from "../session/CornerAnalysis";

const PURPLE = "#a855f7";
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"];
const minuteLabel = (m: number) => `${Math.floor(m)}′`;

const drv = (d: { name_acronym: string; team_colour: string }, team?: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (d.team_colour || "666") }} />
    <span style={{ fontWeight: 700 }}>{d.name_acronym}</span>
    {team && <span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{team}</span>}
  </span>
);
const compoundBadge = (c: string | null | undefined) => (c ? <span style={{ color: TC[c] || C.textDim, fontWeight: 700, fontSize: 10, letterSpacing: "0.08em" }}>{c}</span> : <span style={{ color: C.textFaint }}>—</span>);

function useSelectionBinding<R>(key: (r: R) => number) {
  const sel = useSelection();
  return {
    highlightKeys: sel.selected, dimOthers: true,
    onRowClick: (r: R) => sel.toggle(key(r)),
    onRowHover: (r: R | null) => sel.setHovered(r ? key(r) : null),
  } as const;
}

// --- Hero -------------------------------------------------------------------------------

export function PoleHero({ label }: { label: string }) {
  const { model } = useSessionModel();
  const best = useMemo(() => (model ? bestLapsByDriver(model) : null), [model]);
  if (!model || !best?.ok) return null;
  const p = best.value[0];
  const colour = "#" + (p.driver.team_colour || "888");
  return (
    <section style={{
      background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceAlt} 100%)`, border: `1px solid ${colour}33`, borderRadius: 12,
      padding: "16px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${colour}22`, border: `2px solid ${colour}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: M, fontWeight: 800, fontSize: 18, color: colour }}>{p.driver.driver_number}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, letterSpacing: "0.12em" }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.1, marginTop: 4 }}>{p.driver.full_name}</div>
        <div style={{ fontSize: 13, color: C.textDim, marginTop: 2 }}>{p.team} · lap {p.lap.lap_number} · {p.lapsCompleted} timed laps</div>
      </div>
      <div style={{ textAlign: "right", fontFamily: M }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmt.lapTime(p.bestLap)}</div>
        <div style={{ marginTop: 4, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "baseline" }}>
          {compoundBadge(p.compound)}
          {best.value[1] && <span style={{ fontSize: 11, color: C.textMute }}>+{best.value[1].gapToPole.toFixed(3)} to {best.value[1].driver.name_acronym}</span>}
        </div>
      </div>
    </section>
  );
}

// --- Best laps ----------------------------------------------------------------------------

export function BestLapsCard({ title = "Best laps", hint }: { title?: string; hint?: string }) {
  const { model } = useSessionModel();
  const bind = useSelectionBinding<BestLapRow & { rank: number }>(r => r.driver.driver_number);
  const clock = useMemo(() => (model ? sessionClock(model) : null), [model]);
  const best = useMemo(() => (model ? bestLapsByDriver(model) : null), [model]);
  const push = useMemo(() => (model ? pushLaps(model, clock) : null), [model, clock]);
  const secs = useMemo(() => (model ? sectorBests(model) : null), [model]);
  if (!model || !best) return null;
  const quali = model.kind === "qualifying";
  const phases = quali && clock ? clock.phases : [];
  const phaseBestOf = (dn: number, i: number) => (push?.ok ? push.value.find(d => d.driver.driver_number === dn)?.phaseBests[i] ?? null : null);
  const fieldBests = secs?.ok ? secs.value.fieldBests : null;
  const sectorCell = (v: number | null, i: 0 | 1 | 2) => {
    if (v == null) return "—";
    const purple = fieldBests != null && Math.abs(v - fieldBests[i]) < 5e-4;
    return <span style={{ color: purple ? PURPLE : undefined, fontWeight: purple ? 700 : 400 }}>{v.toFixed(3)}</span>;
  };
  const columns: Column<BestLapRow & { rank: number }>[] = [
    { key: "rank", label: "#", render: r => <span style={{ color: podiumColor(r.rank - 1), fontWeight: 800 }}>{r.rank}</span>, align: "right", mono: true, width: 36 },
    { key: "driver", label: "Driver", render: r => drv(r.driver, r.team) },
    { key: "best", label: "Best lap", render: r => fmt.lapTime(r.bestLap), align: "right", mono: true, sort: (a, b) => a.bestLap - b.bestLap },
    { key: "gap", label: "Gap", render: r => (r.gapToPole === 0 ? <span style={{ color: C.pos }}>{quali ? "pole" : "fastest"}</span> : "+" + r.gapToPole.toFixed(3)), align: "right", mono: true, sort: (a, b) => a.gapToPole - b.gapToPole },
    { key: "pct", label: "%", render: r => (r.gapToPole === 0 ? "—" : "+" + r.gapPct.toFixed(2)), align: "right", mono: true, hideBelow: 900 },
    ...phases.map((p, i) => ({
      key: `ph${i}`, label: p.name, align: "right" as const, mono: true, hideBelow: 640 as const,
      render: (r: BestLapRow) => { const v = phaseBestOf(r.driver.driver_number, i); return v == null ? <span style={{ color: C.textFaint }}>—</span> : fmt.lapTime(v); },
      sort: (a: BestLapRow, b: BestLapRow) => (phaseBestOf(a.driver.driver_number, i) ?? Infinity) - (phaseBestOf(b.driver.driver_number, i) ?? Infinity),
    })),
    { key: "s1", label: "S1", render: r => sectorCell(r.s1, 0), align: "right", mono: true, hideBelow: 640 },
    { key: "s2", label: "S2", render: r => sectorCell(r.s2, 1), align: "right", mono: true, hideBelow: 640 },
    { key: "s3", label: "S3", render: r => sectorCell(r.s3, 2), align: "right", mono: true, hideBelow: 640 },
    { key: "tyre", label: "Tyre", render: r => compoundBadge(r.compound), align: "right", hideBelow: 480 },
    { key: "trap", label: "Trap", render: r => (r.st_speed != null ? fmt.kph(r.st_speed) : "—"), align: "right", mono: true, hideBelow: 900, sort: (a, b) => (a.st_speed ?? 0) - (b.st_speed ?? 0) },
    { key: "laps", label: "Laps", render: r => r.lapsCompleted, align: "right", mono: true, hideBelow: 900 },
  ];
  return (
    <Section
      id={SECTION_IDS.bestLaps}
      title={title}
      hint={hint ?? (quali
        ? <>Each driver's best timed lap, with their best in each segment and the sectors of the best lap. <span style={{ color: PURPLE }}>Purple</span> marks the session's best sector.</>
        : <>Each driver's best timed lap and the sectors of it. Fuel loads differ in practice, so a gap here is a run-plan difference as much as a pace one. <span style={{ color: PURPLE }}>Purple</span> marks the session's best sector.</>)}
      method={{
        summary: "Best lap = quickest timed lap that is not a pit-out lap and not the first lap of the session; laps under a red flag are excluded. Segments are found from gaps of 5 minutes or more in the field's running.",
        caveats: model.coverage.stints ? undefined : ["Stint data not published — tyre column is empty."],
      }}
      confidence={best.ok ? best.confidence : undefined}
      share={{ meta: `${model.meeting?.meeting_name ?? ""} ${model.info.session_name} best laps`, filename: "openf1ow-best-laps" }}
    >
      <Gate result={best} what="best laps" inline={false}>
        {v => <Table columns={columns} rows={v.map((r, i) => ({ ...r, rank: i + 1 }))} rowKey={r => r.driver.driver_number} compact {...bind} />}
      </Gate>
    </Section>
  );
}

// --- Sector bests --------------------------------------------------------------------------

export function SectorBestsCard() {
  const { model } = useSessionModel();
  const bind = useSelectionBinding<SectorBestRow>(r => r.driver.driver_number);
  const result = useMemo(() => (model ? sectorBests(model) : null), [model]);
  if (!model || !result) return null;
  const king = (r: SectorBestRow, i: 0 | 1 | 2) => <span style={{ color: r.kings[i] ? PURPLE : undefined, fontWeight: r.kings[i] ? 700 : 400 }}>{r.bests[i].toFixed(3)}</span>;
  const columns: Column<SectorBestRow>[] = [
    { key: "rank", label: "#", render: r => r.actualRank, align: "right", mono: true, width: 36 },
    { key: "driver", label: "Driver", render: r => drv(r.driver, r.team) },
    { key: "s1", label: "Best S1", render: r => king(r, 0), align: "right", mono: true, sort: (a, b) => a.bests[0] - b.bests[0] },
    { key: "s2", label: "Best S2", render: r => king(r, 1), align: "right", mono: true, sort: (a, b) => a.bests[1] - b.bests[1] },
    { key: "s3", label: "Best S3", render: r => king(r, 2), align: "right", mono: true, sort: (a, b) => a.bests[2] - b.bests[2] },
    { key: "theo", label: "Theoretical", render: r => fmt.lapTime(r.theoretical), align: "right", mono: true, sort: (a, b) => a.theoretical - b.theoretical, title: "Own best sectors summed" },
    { key: "best", label: "Best lap", render: r => fmt.lapTime(r.best), align: "right", mono: true, hideBelow: 640, sort: (a, b) => a.best - b.best },
    { key: "left", label: "Left on table", render: r => (r.leftOnTable < 0.0005 ? <span style={{ color: C.pos }}>none</span> : <span style={{ color: r.leftOnTable >= 0.2 ? C.warn : undefined }}>{r.leftOnTable.toFixed(3)}</span>), align: "right", mono: true, sort: (a, b) => a.leftOnTable - b.leftOnTable },
    { key: "would", label: "Would be", render: r => (r.theoreticalRank < r.actualRank ? <span style={{ color: C.pos }}>P{r.theoreticalRank}</span> : <span style={{ color: C.textMute }}>P{r.theoreticalRank}</span>), align: "right", mono: true, hideBelow: 480, title: "Where the theoretical lap would rank among the actual best laps" },
  ];
  return (
    <Section
      id={SECTION_IDS.sectorBests}
      title="Sector bests and the ultimate lap"
      hint={<>Each driver's best time in each sector, whichever lap it came from. <span style={{ color: PURPLE }}>Purple</span> = the field's best; the three purple sectors add up to the ultimate lap.</>}
      method={{ summary: "Sectors are taken from every eligible lap (not pit-out, not the first lap, not under a red flag). Theoretical = own three bests summed; the sectors need not come from one run or one tyre, so it is an upper bound on what was available." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "sector bests", filename: "openf1ow-sector-bests" }}
    >
      <Gate result={result} what="sector times" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <StatTile grow label="Ultimate lap" value={fmt.lapTime(v.ultimateLap)} mono accent={PURPLE} sub={`${(v.pole - v.ultimateLap).toFixed(3)} s under ${model.kind === "qualifying" ? "pole" : "the best lap"}`} />
              {v.kings.map((k, i) => k && (
                <StatTile key={i} grow label={`Sector ${i + 1}`} value={k.name_acronym} teamColor={"#" + (k.team_colour || "666")} sub={v.fieldBests[i].toFixed(3) + " s"} />
              ))}
            </div>
            <Table columns={columns} rows={v.rows} rowKey={r => r.driver.driver_number} compact maxHeight={520} {...bind} />
          </>
        )}
      </Gate>
    </Section>
  );
}

// --- Session evolution ----------------------------------------------------------------------

export function SessionEvolutionCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const clock = useMemo(() => (model ? sessionClock(model) : null), [model]);
  const push = useMemo(() => (model ? pushLaps(model, clock) : null), [model, clock]);
  if (!model || !push) return null;
  const series: Series[] = push.ok ? push.value.map(d => ({
    key: String(d.driver.driver_number), label: d.driver.name_acronym, color: "#" + (d.driver.team_colour || "666"),
    dash: isSecondDriverOfTeam(model, d.driver.driver_number),
    points: d.laps.map(l => ({ x: l.minute, y: l.time })),
    rank: d.best,
  })) : [];
  const top = new Set(series.slice(0, 6).map(s => s.key));
  const bands = clock && clock.phases.length > 1
    ? clock.phases.filter((_, i) => i % 2 === 1).map(p => ({ from: p.fromMin, to: p.toMin, color: "rgba(255,255,255,0.035)", label: p.name }))
    : [];
  return (
    <Section
      id={SECTION_IDS.sessionEvolution}
      title="Push laps through the session"
      hint={`Every driver's push laps (within ${Math.round((PUSH_LAP_FACTOR - 1) * 100)} % of their own best) against the session clock. A field drifting downward is the track coming in; one line dropping alone is a driver finding time.`}
      method={{ summary: "x = minutes since the first timed lap of the session; y = lap time. Pit-out, first and red-flag laps are excluded, then laps slower than 3 % over the driver's own best (cool-down, traffic, aborted). Shaded bands separate qualifying segments, found from gaps of ≥ 5 minutes in the field's running." }}
      share={{ meta: "push laps", filename: "openf1ow-session-evolution" }}
    >
      <Gate result={push} what="push laps" inline={false}>
        {() => (
          <LineChart
            series={series}
            height={380}
            curve="linear"
            showDots
            endDots={false}
            x={{ domain: clock ? [0, Math.max(1, clock.endMin)] : undefined, format: minuteLabel, label: "Session time", targetTicks: 8 }}
            y={{ format: fmt.lapTime, targetTicks: 6 }}
            bands={bands}
            focus={sel.focusKeys ?? top}
            hovered={sel.hoveredKey}
            onHover={k => sel.setHovered(k ? Number(k) : null)}
            onSelect={k => sel.toggle(Number(k))}
            format={y => fmt.lapTime(y)}
            tipTitle={m => `${minuteLabel(m)} into the session${clock && clock.phases.length > 1 ? ` · ${clock.phases.find(p => m >= p.fromMin - 0.01 && m <= p.toMin + 0.01)?.name ?? ""}` : ""}`}
            legend={{ columns: 2, compact: true, hint: true }}
            ariaLabel="Push-lap times through the session"
          />
        )}
      </Gate>
    </Section>
  );
}

export function TrackEvolutionCard() {
  const { model } = useSessionModel();
  const clock = useMemo(() => (model ? sessionClock(model) : null), [model]);
  const result = useMemo(() => (model ? trackEvolution(model, clock) : null), [model, clock]);
  if (!model || !result) return null;
  return (
    <Section
      id={SECTION_IDS.trackEvolution}
      title="Track evolution"
      hint="How much quicker (or slower) a push lap got as the session went on — grip laid down, or a track cooling off. Fitted across the whole field, with each driver's own level taken out, so who ran when is not mistaken for grip."
      method={{
        summary: "Push-lap time regressed on session minute with a fixed effect per driver (each driver's laps are centred on their own mean before fitting). The slope is shared by every driver; the interval is a 95 % t-interval on it.",
        steps: [`Minimum ${TRACK_EVOLUTION_MIN_LAPS} push laps from ${TRACK_EVOLUTION_MIN_DRIVERS} drivers with two or more each.`],
        caveats: result.ok && result.notes ? result.notes : undefined,
      }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "track evolution", filename: "openf1ow-track-evolution" }}
    >
      <Gate result={result} what="track evolution" inline={false}>
        {v => (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatTile grow label="Per 10 minutes" value={fmt.signedSec(v.secPerMin * 10, 3) + " s"} mono accent={v.secPerMin < 0 ? C.pos : C.warn} sub={`95 % ${fmt.signedSec(v.ci95[0] * 10, 3)} to ${fmt.signedSec(v.ci95[1] * 10, 3)}`} />
              <StatTile grow label="Over the session" value={fmt.signedSec(v.totalGain, 2) + " s"} mono sub={`${v.spanMin.toFixed(0)} min of push laps`} />
              <StatTile grow label="Sample" value={`${v.n} laps`} mono sub={`${v.drivers} drivers · within-driver R² ${v.r2Within.toFixed(2)}`} />
            </div>
            {v.phaseBests.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                {v.phaseBests.map(p => (
                  <StatTile key={p.phase.index} grow label={`Best ${p.phase.name} lap`} value={p.best != null ? fmt.lapTime(p.best) : "—"} mono
                    teamColor={p.driver ? "#" + (p.driver.team_colour || "666") : undefined} sub={p.driver ? p.driver.name_acronym : "no push laps"} />
                ))}
              </div>
            )}
          </>
        )}
      </Gate>
    </Section>
  );
}

// --- Run plan -------------------------------------------------------------------------------

export function RunPlanCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const clock = useMemo(() => (model ? sessionClock(model) : null), [model]);
  const result = useMemo(() => (model ? runPlan(model, clock) : null), [model, clock]);
  if (!model || !result || !clock) return null;
  const rows: TimelineRow[] = result.ok ? result.value.map(d => ({
    key: String(d.driver.driver_number),
    label: d.driver.name_acronym,
    sub: d.best != null ? fmt.lapTime(d.best) : undefined,
    dim: sel.focusKeys ? !sel.focusKeys.has(String(d.driver.driver_number)) : false,
    spans: d.runs.map(r => ({
      from: r.fromMin, to: r.toMin, color: TC[r.compound] || "#666", opacity: 0.55,
      label: r.laps >= 3 ? `${r.laps}L` : undefined,
      tip: <><b>{d.driver.name_acronym}</b> · run {r.stintNumber} · {r.compound.toLowerCase()}<br />{minuteLabel(r.fromMin)}–{minuteLabel(r.toMin)} · {r.laps} laps, {r.pushLaps} push{r.best != null ? ` · best ${fmt.lapTime(r.best)}` : ""}</>,
    })),
    marks: d.pushMinutes.map(p => ({ x: p.minute, shape: p.isBest ? "flag" as const : "dot" as const, color: p.isBest ? PURPLE : "var(--text)", dim: !p.isBest, tip: <>{p.isBest ? "Best lap" : "Push lap"} · {fmt.lapTime(p.time)} at {minuteLabel(p.minute)}</> })),
  })) : [];
  const bands = clock.phases.length > 1 ? clock.phases.filter((_, i) => i % 2 === 1).map(p => ({ from: p.fromMin, to: p.toMin, color: "rgba(255,255,255,0.035)", label: p.name })) : [];
  return (
    <Section
      id={SECTION_IDS.runPlan}
      title="Run plan"
      hint="When each driver was on track, on which tyre, and where the push laps fell. Diamonds are push laps; the purple flag is the best lap. Ordered by best lap."
      method={{ summary: "Runs from the stint feed, placed on the session clock by the first and last timed lap in each. Push laps are within 3 % of the driver's own best." }}
      share={{ meta: "run plan", filename: "openf1ow-run-plan" }}
    >
      <Gate result={result} what="run plan" inline={false}>
        {() => (
          <>
            <Timeline rows={rows} xDomain={[0, Math.max(1, clock.endMin)]} bands={bands} continuous xLabel="Session time" xFormat={minuteLabel}
              highlightKey={sel.hoveredKey} onRowHover={k => sel.setHovered(k ? Number(k) : null)} ariaLabel="Runs per driver on the session clock" />
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: C.textMute }}>
              {COMPOUND_ORDER.filter(c => result.ok && result.value.some(d => d.runs.some(r => r.compound === c))).map(c => (
                <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: TC[c] || "#666", opacity: 0.7 }} />{c.toLowerCase()}</span>
              ))}
            </div>
          </>
        )}
      </Gate>
    </Section>
  );
}

// --- Start tyres (qualifying) ----------------------------------------------------------------

export function StartTyresCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const best = useMemo(() => (model ? bestLapsByDriver(model) : null), [model]);
  if (!model || !best) return null;
  return (
    <Section
      id={SECTION_IDS.startTyres}
      title="Top ten — tyre of the best lap"
      hint="The compound each of the top ten set their best lap on. Under the current rules the race start tyre is a free choice, so this is the tyre each car was quickest on — a hint, not a commitment."
      method={{ summary: "Compound from the stint feed for the lap that set the driver's best time." }}
      share={{ meta: "top ten tyres", filename: "openf1ow-start-tyres" }}
    >
      <Gate result={best} what="best laps">
        {v => (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {v.slice(0, 10).map((r, i) => {
              const dn = r.driver.driver_number;
              const dim = sel.focusKeys ? !sel.focusKeys.has(String(dn)) : false;
              return (
                <button key={dn} type="button" onClick={() => sel.toggle(dn)} onMouseEnter={() => sel.setHovered(dn)} onMouseLeave={() => sel.setHovered(null)} style={{
                  textAlign: "left", cursor: "pointer", padding: "10px 12px", background: C.surfaceAlt, border: "1px solid " + (sel.selected.has(dn) ? C.borderStrong : C.border),
                  borderLeft: "3px solid #" + (r.driver.team_colour || "666"), borderRadius: 8, fontFamily: "var(--font)", color: C.text, opacity: dim ? 0.4 : 1, transition: "opacity .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: podiumColor(i) }}>P{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.driver.name_acronym}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMute, marginTop: 4 }}>{r.team}</div>
                  <div style={{ marginTop: 6 }}>{compoundBadge(r.compound)}</div>
                </button>
              );
            })}
          </div>
        )}
      </Gate>
    </Section>
  );
}

// --- Teammates on one lap -------------------------------------------------------------------

export function TeammateSingleLapCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const clock = useMemo(() => (model ? sessionClock(model) : null), [model]);
  const result = useMemo(() => (model ? teammateSingleLap(model, clock) : null), [model, clock]);
  if (!model || !result) return null;
  const quali = model.kind === "qualifying";
  const both = (p: SingleLapPair) => [p.a.driver_number, p.b.driver_number];
  const columns: Column<SingleLapPair>[] = [
    { key: "team", label: "Team", render: p => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (p.a.team_colour || "666") }} /><b>{p.team}</b></span> },
    { key: "a", label: "Driver", render: p => <>{p.a.name_acronym} <span style={{ color: C.textMute, fontFamily: M, fontSize: 11 }}>{fmt.lapTime(p.bestA)}</span></> },
    { key: "b", label: "Teammate", render: p => <>{p.b.name_acronym} <span style={{ color: C.textMute, fontFamily: M, fontSize: 11 }}>{fmt.lapTime(p.bestB)}</span></> },
    { key: "gap", label: "Gap", render: p => <><b>{p.faster.name_acronym}</b> by {p.gap.toFixed(3)} <span style={{ color: C.textMute }}>({p.gapPct.toFixed(2)} %)</span></>, mono: true, align: "right", sort: (a, b) => a.gap - b.gap },
    ...(quali ? [{
      key: "phases", label: "Segments", align: "right" as const, hideBelow: 640 as const,
      render: (p: SingleLapPair) => {
        const shared = p.phases.filter(x => x.delta != null);
        if (!shared.length) return <span style={{ color: C.textFaint }}>—</span>;
        return (
          <span style={{ display: "inline-flex", gap: 6 }}>
            {shared.map(x => <Badge key={x.phase.index} size="sm" tone={(x.delta as number) < 0 ? "pos" : (x.delta as number) > 0 ? "neg" : "mute"} title={`${x.phase.name}: ${p.a.name_acronym} ${fmt.signedSec(x.delta as number)}`}>{x.phase.name} {(x.delta as number) < 0 ? p.a.name_acronym : p.b.name_acronym}</Badge>)}
          </span>
        );
      },
    }] : [{
      key: "longrun", label: "Long run", align: "right" as const, hideBelow: 640 as const,
      render: (p: SingleLapPair) => p.longRunDelta
        ? <span title={`${p.longRunDelta.lapsA} vs ${p.longRunDelta.lapsB} laps`}><b>{p.longRunDelta.delta < 0 ? p.a.name_acronym : p.b.name_acronym}</b> by {Math.abs(p.longRunDelta.delta).toFixed(3)} <span style={{ color: TC[p.longRunDelta.compound] || C.textMute, fontSize: 10, fontWeight: 700 }}>{p.longRunDelta.compound[0]}</span></span>
        : <span style={{ color: C.textFaint }}>no shared run</span>,
    }]),
  ];
  return (
    <Section
      id={SECTION_IDS.teammatesSingleLap}
      title="Teammates on one lap"
      hint={quali ? "Best lap against best lap in the same car, and who was ahead in each segment both drivers ran. One lap each, so a small gap is within the noise of a single run." : "Best lap against best lap in the same car, and — where both did one on the same compound — the long-run median."}
      method={{ summary: quali ? "Gap = |best A − best B|. Segment badges compare the two drivers' best laps inside each qualifying segment. All drivers who ran for a team are paired." : "Gap = |best A − best B|. Long run = median lap of each driver's longest stint of ≥ 6 clean laps on the compound they share; raw times, unknown fuel." }}
      confidence={result.ok ? result.confidence : undefined}
      share={{ meta: "teammates, single lap", filename: "openf1ow-teammates-single-lap" }}
    >
      <Gate result={result} what="teammate pairs" inline={false}>
        {v => <Table columns={columns} rows={v} rowKey={p => `${p.a.driver_number}-${p.b.driver_number}`} compact
          highlightKeys={new Set(v.filter(p => both(p).some(dn => sel.selected.has(dn))).map(p => `${p.a.driver_number}-${p.b.driver_number}`))} dimOthers={sel.selected.size > 0}
          onRowClick={p => both(p).forEach(dn => sel.toggle(dn))} onRowHover={p => sel.setHovered(p ? p.faster.driver_number : null)} />}
      </Gate>
    </Section>
  );
}

// --- Practice: long runs and programmes -------------------------------------------------------

export function LongRunsCard() {
  const { model } = useSessionModel();
  const bind = useSelectionBinding<LongRun>(r => r.driver.driver_number);
  const [compound, setCompound] = useState<string>("all");
  const result = useMemo(() => (model ? longRuns(model) : null), [model]);
  if (!model || !result) return null;
  const compounds = result.ok ? COMPOUND_ORDER.filter(c => result.value.some(r => r.compound === c)) : [];
  const columns: Column<LongRun>[] = [
    { key: "driver", label: "Driver", render: r => drv(r.driver, r.team) },
    { key: "compound", label: "Tyre", render: r => compoundBadge(r.compound) },
    { key: "laps", label: "Laps", render: r => r.laps.length, align: "right", mono: true, sort: (a, b) => a.laps.length - b.laps.length },
    { key: "range", label: "Run", render: r => `L${r.startLap}–${r.endLap}`, align: "right", mono: true, hideBelow: 640 },
    { key: "median", label: "Median", render: r => fmt.lapTime(r.medianPace), align: "right", mono: true, sort: (a, b) => a.medianPace - b.medianPace },
    { key: "best", label: "Best", render: r => <span style={{ color: PURPLE }}>{fmt.lapTime(r.bestLap)}</span>, align: "right", mono: true, hideBelow: 480, sort: (a, b) => a.bestLap - b.bestLap },
    { key: "slope", label: "Slope", render: r => (r.fit ? <span style={{ color: r.fit.slope > 0.05 ? C.warn : undefined }}>{fmt.signedSec(r.fit.slope, 3)}/lap{r.fit.r2 < 0.3 ? <span style={{ color: C.textFaint }}> ~</span> : null}</span> : "—"), align: "right", mono: true, hideBelow: 640, sort: (a, b) => (a.fit?.slope ?? 0) - (b.fit?.slope ?? 0), title: "Raw lap time per lap into the run; ~ marks a weak fit (R² < 0.3)" },
  ];
  return (
    <Section
      id={SECTION_IDS.longRuns}
      title="Long runs"
      hint="Stints of six or more clean laps after the out-lap — the race simulations. Median pace is the most useful race read from practice; slopes are raw because fuel is unknown."
      method={{ summary: "A run is a stint's clean laps after its first lap (per-stint outliers, pit laps and red-flag laps removed). Slope = ordinary least squares of raw lap time on laps into the run; negative means the car got quicker as fuel burned off faster than the tyre wore.", caveats: result.ok ? result.notes : undefined }}
      confidence={result.ok ? result.confidence : undefined}
      actions={compounds.length > 1 ? <Segmented size="sm" role="radiogroup" ariaLabel="Compound" value={compound} onChange={setCompound} options={[{ key: "all", label: "All" }, ...compounds.map(c => ({ key: c, label: c[0] + c.slice(1).toLowerCase() }))]} /> : undefined}
      share={{ meta: "long runs", filename: "openf1ow-long-runs" }}
    >
      <Gate result={result} what="long runs" inline={false}>
        {v => <Table columns={columns} rows={compound === "all" ? v : v.filter(r => r.compound === compound)} rowKey={r => `${r.driver.driver_number}-${r.stintNumber}`} compact maxHeight={520}
          highlightKeys={bind.highlightKeys} dimOthers onRowClick={bind.onRowClick} onRowHover={bind.onRowHover} />}
      </Gate>
    </Section>
  );
}

export function CompoundProgramCard() {
  const { model } = useSessionModel();
  const sel = useSelection();
  const result = useMemo(() => (model ? compoundPrograms(model) : null), [model]);
  if (!model || !result) return null;
  return (
    <Section
      id={SECTION_IDS.compoundProgram}
      title="Compound programme"
      hint="Laps each driver completed on each compound. Heavy hard-tyre running points to a race-stint focus; mostly soft, a qualifying one."
      method={{ summary: "Lap counts per compound from the stint feed (lap_end − lap_start + 1 per stint)." }}
      share={{ meta: "compound programme", filename: "openf1ow-compound-programme" }}
    >
      <Gate result={result} what="stints">
        {v => (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {v.map((p: CompoundProgram) => {
              const dn = p.driver.driver_number;
              const dim = sel.focusKeys ? !sel.focusKeys.has(String(dn)) : false;
              return (
                <button key={dn} type="button" onClick={() => sel.toggle(dn)} onMouseEnter={() => sel.setHovered(dn)} onMouseLeave={() => sel.setHovered(null)} style={{
                  textAlign: "left", cursor: "pointer", padding: "12px 14px", background: C.surfaceAlt, border: "1px solid " + (sel.selected.has(dn) ? C.borderStrong : C.border),
                  borderLeft: "3px solid #" + (p.driver.team_colour || "666"), borderRadius: 8, fontFamily: "var(--font)", color: C.text, opacity: dim ? 0.4 : 1, transition: "opacity .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span><span style={{ fontSize: 13, fontWeight: 700 }}>{p.driver.name_acronym}</span><span style={{ fontSize: 10, color: C.textMute, marginLeft: 6 }}>{p.team}</span></span>
                    <span style={{ fontFamily: M, fontSize: 12, color: C.textDim }}>{p.totalLaps}L</span>
                  </div>
                  <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden", background: C.surface }}>
                    {COMPOUND_ORDER.filter(c => p.byCompound[c]).map(c => <div key={c} style={{ flex: p.byCompound[c], background: TC[c] || "#666", minWidth: 2 }} title={`${c}: ${p.byCompound[c]} laps`} />)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 10, fontFamily: M }}>
                    {COMPOUND_ORDER.filter(c => p.byCompound[c]).map(c => <span key={c} style={{ color: C.textDim }}><span style={{ color: TC[c] || C.textDim, fontWeight: 700 }}>{c[0]}</span> {p.byCompound[c]}</span>)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Gate>
    </Section>
  );
}

// --- Track: the headline lap on the map ----------------------------------------------------------

export function HeadlineLapTrackCards({ sessionKey }: { sessionKey: string }) {
  const { model } = useSessionModel();
  const sel = useSelection();
  const best = useMemo(() => (model ? bestLapsByDriver(model) : null), [model]);
  if (!model || !best?.ok) return null;
  // The first selected driver's best lap, else the session's best.
  const chosenDn = [...sel.selected][0];
  const row = (chosenDn != null && best.value.find(r => r.driver.driver_number === chosenDn)) || best.value[0];
  const lap = row.lap;
  if (!lap.date_start || !lap.lap_duration) return null;
  const lapRef = { date_start: lap.date_start, lap_duration: lap.lap_duration, lap_number: lap.lap_number };
  const who = `${row.driver.full_name}'s ${row === best.value[0] ? (model.kind === "qualifying" ? "pole" : "best") : "best"} lap`;
  return (
    <>
      <Section id={SECTION_IDS.poleLap} title={`${row === best.value[0] && model.kind === "qualifying" ? "Pole lap" : "Best lap"} — speed trace`}
        hint={<>{who}, drawn around the circuit. Blue = slow corners, red = top-end straights. Select a driver in any table to map their lap instead.</>}
        share={{ meta: "lap speed trace", filename: "openf1ow-lap-map" }}>
        <TrackMap key={`${row.driver.driver_number}-${lap.lap_number}`} sessionKey={sessionKey} driverNumber={row.driver.driver_number} driverColor={row.driver.team_colour} lap={lapRef} label={`${row.driver.name_acronym} · L${lap.lap_number}`} height={420} />
      </Section>
      <Section id={SECTION_IDS.corners} title="Corner by corner" hint={<>Apex speed, braking duration and time to full throttle for each corner of {who}.</>}>
        <CornerAnalysis key={`${row.driver.driver_number}-${lap.lap_number}`} sessionKey={sessionKey} driverNumber={row.driver.driver_number} lap={lapRef} />
      </Section>
    </>
  );
}

/** Short prose for the session banner. */
export function sessionIntro(model: SessionModel): string {
  if (model.kind === "qualifying") {
    return /sprint/i.test(model.info.session_name)
      ? "Single-lap pace for the sprint grid. Each driver's best lap, the segments, the sectors that add up to the ultimate lap, and the tyre they were quickest on."
      : "Single-lap pace, not race pace. Each driver's best lap, how the segments went, the sectors that add up to the ultimate lap, and how much the track came to the field.";
  }
  return "Practice mixes qualifying simulations, race runs and tyre evaluation, so fuel loads are unknown and single-lap order is only half the story. Best laps, long runs and the compound programme, each with its caveat.";
}
