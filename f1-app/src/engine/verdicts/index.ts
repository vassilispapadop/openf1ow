// Verdicts: what a race engineer would say first, with the numbers behind
// it. Every rule reads a gated analysis and only speaks when it is ok, so a
// verdict never rests on a sample below its gate.

import type { SessionModel } from "../types/model.ts";
import type { Verdict } from "./types.ts";
import { paceRanking, truePaceRanking } from "../analyses/pace.ts";
import { bestLapsByDriver } from "../analyses/quali.ts";
import { driverDegradation } from "../analyses/degradation.ts";
import { teammateComparisons } from "../analyses/teammates.ts";
import { undercutAnalysis } from "../analyses/undercut.ts";
import { dirtyAirAnalysis } from "../analyses/dirtyAir.ts";
import { neutralisationImpact } from "../analyses/neutralisationImpact.ts";
import { startAnalysis } from "../analyses/start.ts";
import { conversionAnalysis } from "../analyses/conversion.ts";
import { pitStopAnalysis } from "../analyses/pitstops.ts";
import { overtakeAnalysis } from "../analyses/overtakes.ts";
import { singleLapVerdicts } from "./singleLap.ts";

export type { Verdict, VerdictArea, VerdictNumber } from "./types.ts";

/** Section ids the race page uses as evidence anchors — public API. */
export const SECTION_IDS = {
  verdicts: "verdicts", kpis: "kpis", raceShape: "race-shape", start: "start", gridFinish: "grid-finish", narrative: "narrative",
  truePace: "true-pace", lapEvolution: "lap-evolution", deltaTrace: "delta-trace", sectors: "sectors", consistency: "consistency",
  strategyTimeline: "strategy-timeline", undercut: "undercut", tyreLife: "tyre-life", degradation: "degradation", fuel: "fuel", pitCrew: "pit-crew", whatIfPit: "what-if-pit",
  overtakes: "overtakes", teammates: "teammates", constructors: "constructors", dirtyAir: "dirty-air", scImpact: "sc-impact",
  weather: "weather", clipping: "clipping", replay: "replay",
  // Qualifying / practice
  bestLaps: "best-laps", poleLap: "pole-lap", sectorBests: "sector-bests", sessionEvolution: "session-evolution", trackEvolution: "track-evolution",
  runPlan: "run-plan", startTyres: "start-tyres", longRuns: "long-runs", compoundProgram: "compound-program", teammatesSingleLap: "teammates-single-lap", corners: "corners",
} as const;

const s3 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3) + " s";
const lapTime = (v: number) => { const m = Math.floor(v / 60); return m > 0 ? `${m}:${(v - m * 60).toFixed(3).padStart(6, "0")}` : v.toFixed(3); };

export function generateVerdicts(model: SessionModel): Verdict[] {
  if (model.kind === "qualifying" || model.kind === "practice") return singleLapVerdicts(model, SECTION_IDS).sort((a, b) => b.impact - a.impact);
  const out: Verdict[] = [];
  if (model.kind !== "race") return out;

  // --- Result -----------------------------------------------------------------
  const winner = model.drivers.find(d => d.classification.position === 1);
  const second = model.drivers.find(d => d.classification.position === 2);
  if (winner) {
    const margin = typeof second?.classification.gapToLeader === "number" ? second.classification.gapToLeader : null;
    out.push({
      id: "race_winner", area: "overview", impact: 100, confidence: "high",
      headline: `${winner.driver.name_acronym} won${second ? ` from ${second.driver.name_acronym}` : ""}${margin != null ? ` by ${margin.toFixed(3)} s` : ""}.`,
      detail: `${winner.driver.full_name} (${winner.team}) took the flag${winner.gridPosition != null ? ` from P${winner.gridPosition} on the grid` : ""}.`,
      numbers: [{ label: "Winner", value: winner.driver.name_acronym }, ...(margin != null ? [{ label: "Margin", value: margin.toFixed(3) + " s" }] : [])],
      evidence: { tab: "overview", sectionId: SECTION_IDS.gridFinish, drivers: [winner.driver.driver_number] },
      drivers: [winner.driver.driver_number],
      kpi: { label: "Winner", value: winner.driver.name_acronym, sub: margin != null ? `Margin ${margin.toFixed(3)} s` : "Race winner", accent: "gold" },
    });
  }

  // --- Pace ---------------------------------------------------------------------
  const pace = paceRanking(model);
  const truePace = truePaceRanking(model);
  if (pace.ok && pace.value.ranked.length >= 2) {
    const [p1, p2] = pace.value.ranked;
    out.push({
      id: "fastest_race_pace", area: "pace", impact: 90, confidence: p1.ci95[1] < p2.ci95[0] ? "high" : "medium",
      headline: `${p1.driver.name_acronym} had the fastest race pace, ${s3(p2.medianPace - p1.medianPace).replace("+", "")} a lap over ${p2.driver.name_acronym}.`,
      detail: `Median fuel-corrected clean lap over ${p1.n} laps (95 % interval ±${((p1.ci95[1] - p1.ci95[0]) / 2).toFixed(3)} s). ${p1.ci95[1] < p2.ci95[0] ? "The intervals don't overlap." : "The two intervals overlap, so the order is not certain."}`,
      numbers: [{ label: p1.driver.name_acronym, value: lapTime(p1.medianRaw) }, { label: p2.driver.name_acronym, value: lapTime(p2.medianRaw) }, { label: "Δ / lap (fuel-corrected)", value: s3(p2.medianPace - p1.medianPace) }],
      evidence: { tab: "pace", sectionId: SECTION_IDS.truePace, drivers: [p1.driver.driver_number, p2.driver.driver_number] },
      drivers: [p1.driver.driver_number, p2.driver.driver_number],
    });
    if (truePace.ok && truePace.value.ranked.length && truePace.value.ranked[0].n >= 15 && truePace.value.ranked[0].driver.driver_number !== p1.driver.driver_number) {
      const t1 = truePace.value.ranked[0];
      out.push({
        id: "true_pace_leader", area: "pace", impact: 80, confidence: truePace.confidence,
        headline: `On equal tyres and fuel, ${t1.driver.name_acronym} was the quickest car.`,
        detail: `Normalising every clear-air lap to tyre age 10 with each stint's fitted degradation moves ${t1.driver.name_acronym} ahead of ${p1.driver.name_acronym} — the raw pace order reflects tyre life and traffic, not only speed.`,
        numbers: [{ label: "True pace", value: t1.driver.name_acronym }, { label: "Raw pace", value: p1.driver.name_acronym }, { label: "n", value: String(t1.n) }],
        evidence: { tab: "pace", sectionId: SECTION_IDS.truePace, drivers: [t1.driver.driver_number] },
        drivers: [t1.driver.driver_number],
      } as Verdict);
    }
  }
  const best = bestLapsByDriver(model);
  if (best.ok && best.value.length) {
    const b = best.value[0];
    out.push({
      id: "fastest_lap", area: "pace", impact: 60, confidence: "high",
      headline: `Fastest lap: ${b.driver.name_acronym}, ${lapTime(b.bestLap)} on lap ${b.lap.lap_number}${b.compound ? ` (${b.compound.toLowerCase()})` : ""}.`,
      detail: "Quickest timed lap excluding pit-out laps and lap 1 — not the official award, which requires a top-10 finish.",
      numbers: [{ label: "Lap", value: `L${b.lap.lap_number}` }, { label: "Time", value: lapTime(b.bestLap) }],
      evidence: { tab: "pace", sectionId: SECTION_IDS.lapEvolution, drivers: [b.driver.driver_number] },
      drivers: [b.driver.driver_number],
      kpi: { label: "Fastest lap", value: b.driver.name_acronym, sub: lapTime(b.bestLap), accent: "violet" },
    });
  }

  // --- Tyres & strategy ------------------------------------------------------------
  const deg = driverDegradation(model);
  if (deg.ok && deg.value.length) {
    const d = deg.value[0];
    out.push({
      id: "best_tyre_management", area: "strategy", impact: 55, confidence: deg.confidence,
      headline: `${d.driver.name_acronym} managed the tyres best: ${(d.weightedDeg * 1000).toFixed(0)} ms/lap of degradation.`,
      detail: `Lap-weighted mean of fitted stint slopes over ${d.fitLaps} clear-air laps on ${d.compounds.map(c => c.toLowerCase()).join(", ")}. Negative would mean the tyre was still improving.`,
      numbers: [{ label: "Deg", value: (d.weightedDeg * 1000).toFixed(0) + " ms/lap" }, { label: "Stints", value: String(d.stints) }],
      evidence: { tab: "strategy", sectionId: SECTION_IDS.degradation, drivers: [d.driver.driver_number] },
      drivers: [d.driver.driver_number],
      kpi: { label: "Tyre master", value: d.driver.name_acronym, sub: (d.weightedDeg * 1000).toFixed(0) + " ms/lap", accent: "pos" },
    });
  }
  for (const d of model.drivers) for (const st of d.stints) {
    if (!st.cliff.ok) continue;
    const c = st.cliff.value;
    out.push({
      id: `cliff_${d.driver.driver_number}_${st.stint_number}`, area: "strategy", impact: 50, confidence: st.cliff.confidence,
      headline: `${d.driver.name_acronym}'s ${st.compound.toLowerCase()} tyres fell off a cliff at ${c.atTyreAge} laps old.`,
      detail: `Degradation went from ${(c.slopeBefore * 1000).toFixed(0)} to ${(c.slopeAfter * 1000).toFixed(0)} ms/lap (two-segment fit, ΔBIC ${c.deltaBic.toFixed(1)}).`,
      numbers: [{ label: "Cliff at", value: `${c.atTyreAge} laps` }, { label: "Before", value: (c.slopeBefore * 1000).toFixed(0) + " ms/lap" }, { label: "After", value: (c.slopeAfter * 1000).toFixed(0) + " ms/lap" }],
      evidence: { tab: "strategy", sectionId: SECTION_IDS.degradation, drivers: [d.driver.driver_number] },
      drivers: [d.driver.driver_number],
    });
  }
  const uc = undercutAnalysis(model);
  if (uc.ok) {
    const u = uc.value;
    const worked = u.exchanges.filter(e => e.delta < 0).length;
    out.push({
      id: "undercut", area: "strategy", impact: 65, confidence: uc.confidence,
      headline: worked >= u.undercutsTried * 0.67
        ? `The undercut worked: pitting first paid off in ${worked} of ${u.undercutsTried} close exchanges.`
        : worked <= u.undercutsTried * 0.33
          ? `Staying out paid: the earlier stopper gained in only ${worked} of ${u.undercutsTried} close exchanges.`
          : `Neither undercut nor overcut had a clear edge: the first stopper gained in ${worked} of ${u.undercutsTried} close exchanges.`,
      detail: `Cars within 3 s that pitted up to four laps apart; median swing ${u.medianUndercutGain != null ? s3(u.medianUndercutGain) : "—"} in favour of the first stopper.`,
      numbers: [{ label: "Exchanges", value: String(u.undercutsTried) }, { label: "Undercut won", value: String(worked) }, ...(u.medianUndercutGain != null ? [{ label: "Median swing", value: s3(u.medianUndercutGain) }] : [])],
      evidence: { tab: "strategy", sectionId: SECTION_IDS.undercut },
    });
  }
  const pits = pitStopAnalysis(model);
  if (pits.ok && pits.value.teams.length >= 2) {
    const t = pits.value.teams[0];
    out.push({
      id: "pit_crew", area: "strategy", impact: 35, confidence: pits.confidence,
      headline: `${t.team} had the quickest pit crew: median ${t.medianDuration.toFixed(1)} s ${pits.value.metric === "lane" ? "in the pit lane" : "stationary"}.`,
      detail: pits.value.pitLoss.ok ? `A green-flag stop cost about ${pits.value.pitLoss.value.median.toFixed(1)} s on track here (${pits.value.pitLoss.value.n} stops).` : "Not enough green-flag stops to estimate the on-track cost of a stop.",
      numbers: [{ label: t.team, value: t.medianDuration.toFixed(2) + " s" }, ...(pits.value.pitLoss.ok ? [{ label: "Pit loss", value: pits.value.pitLoss.value.median.toFixed(1) + " s" }] : [])],
      evidence: { tab: "strategy", sectionId: SECTION_IDS.pitCrew },
    });
  }

  // --- Battles -------------------------------------------------------------------
  const tm = teammateComparisons(model);
  if (tm.ok) {
    const sig = tm.value.filter(t => t.primary.significant).sort((a, b) => b.primary.gap - a.primary.gap)[0];
    if (sig) {
      const p = sig.primary;
      out.push({
        id: "teammate_gap_significant", area: "battles", impact: 58, confidence: "high",
        headline: `${p.faster.name_acronym} was genuinely quicker than ${p.slower.name_acronym}: ${p.gap.toFixed(3)} s a lap on ${p.n} paired laps.`,
        detail: `Same lap, both clean, same traffic state. 95 % interval ${s3(p.ci95[0])} to ${s3(p.ci95[1])}; sign-test p = ${p.pValue.toFixed(3)}. ${p.faster.name_acronym} won ${Math.max(p.winsA, p.winsB)} of the ${p.n} laps.`,
        numbers: [{ label: "Gap / lap", value: p.gap.toFixed(3) + " s" }, { label: "Paired laps", value: String(p.n) }, { label: "p", value: p.pValue.toFixed(3) }],
        evidence: { tab: "battles", sectionId: SECTION_IDS.teammates, drivers: [p.a.driver_number, p.b.driver_number] },
        drivers: [p.a.driver_number, p.b.driver_number],
      });
    }
  }
  const da = dirtyAirAnalysis(model);
  if (da.ok && da.value.mostAffected && (da.value.mostAffected.medianLoss ?? 0) > 0.25) {
    const m = da.value.mostAffected;
    out.push({
      id: "stuck_in_traffic", area: "battles", impact: 52, confidence: da.confidence,
      headline: `${m.driver.name_acronym} paid most for traffic: ${(m.medianLoss as number).toFixed(2)} s a lap behind another car, on ${m.dirtyLaps} laps.`,
      detail: `${m.worstTrain ? `Longest train: ${m.worstTrain.laps} laps behind ${m.worstTrain.behind?.name_acronym ?? "—"}, ≈${m.worstTrain.loss.toFixed(1)} s. ` : ""}Loss is against the same stint's clear-air median, gaps from the timing feed.`,
      numbers: [{ label: "Loss / lap", value: (m.medianLoss as number).toFixed(2) + " s" }, { label: "Dirty laps", value: String(m.dirtyLaps) }, { label: "Clear-air share", value: Math.round(m.clearShare * 100) + "%" }],
      evidence: { tab: "battles", sectionId: SECTION_IDS.dirtyAir, drivers: [m.driver.driver_number] },
      drivers: [m.driver.driver_number],
    });
  }
  const sc = neutralisationImpact(model);
  if (sc.ok) {
    for (const w of sc.value) {
      const moved = w.rows.filter(r => Math.abs(r.positionsGained ?? 0) >= 2);
      if (!moved.length) continue;
      const win = [...w.rows].sort((a, b) => (b.positionsGained ?? 0) - (a.positionsGained ?? 0))[0];
      const lose = [...w.rows].sort((a, b) => (a.positionsGained ?? 0) - (b.positionsGained ?? 0))[0];
      out.push({
        id: `sc_impact_${w.index}`, area: "battles", impact: 62, confidence: sc.confidence,
        headline: `The ${w.window.kind} on lap ${w.window.lapStart} shuffled the race: ${win.driver.name_acronym} came out ${win.positionsGained} place${win.positionsGained === 1 ? "" : "s"} up, ${lose.driver.name_acronym} ${Math.abs(lose.positionsGained ?? 0)} down.`,
        detail: `Running order on lap ${w.lapBefore} versus the first green lap (${w.lapAfter}); gaps are measured against the field's median change, since everyone closes on the leader under a safety car. ${w.rows.filter(r => r.pittedUnder).length} car(s) pitted under it.`,
        numbers: [{ label: "Window", value: `L${w.window.lapStart}–${w.window.lapEnd}` }, { label: win.driver.name_acronym, value: `P${win.positionBefore} → P${win.positionAfter}` }, { label: lose.driver.name_acronym, value: `P${lose.positionBefore} → P${lose.positionAfter}` }],
        evidence: { tab: "battles", sectionId: SECTION_IDS.scImpact, drivers: [win.driver.driver_number, lose.driver.driver_number] },
        drivers: [win.driver.driver_number, lose.driver.driver_number],
      });
    }
  }
  const ov = overtakeAnalysis(model);
  if (ov.ok && ov.value.byDriver.length && ov.value.totals["on-track"] > 0) {
    const top = ov.value.byDriver[0];
    out.push({
      id: "overtaker", area: "battles", impact: 45, confidence: ov.confidence,
      headline: `${top.driver.name_acronym} made the most on-track passes: ${top.onTrackMade} for, ${top.onTrackSuffered} against.`,
      detail: `${ov.value.totals["on-track"]} on-track overtakes in the race; ${ov.value.totals["pit-cycle"]} swaps through the pit cycle, ${ov.value.totals["under-sc"]} behind the safety car and ${ov.value.totals.lapping + ov.value.totals["un-lapping"]} laps/un-laps are counted separately.`,
      numbers: [{ label: "On-track passes", value: String(ov.value.totals["on-track"]) }, { label: top.driver.name_acronym, value: `+${top.onTrackMade} / −${top.onTrackSuffered}` }],
      evidence: { tab: "battles", sectionId: SECTION_IDS.overtakes, drivers: [top.driver.driver_number] },
      drivers: [top.driver.driver_number],
    });
  }

  // --- Start & conversion --------------------------------------------------------
  const st = startAnalysis(model);
  if (st.ok && st.value.bestStart && (st.value.bestStart.gainedLap1 ?? 0) >= 2) {
    const b = st.value.bestStart, w = st.value.worstStart;
    out.push({
      id: "best_start", area: "overview", impact: 48, confidence: st.confidence,
      headline: `${b.driver.name_acronym} made the start of the race, up ${b.gainedLap1} places on lap 1${w && (w.gainedLap1 ?? 0) <= -2 ? `; ${w.driver.name_acronym} lost ${Math.abs(w.gainedLap1 as number)}` : ""}.`,
      detail: `Grid position against the running order at the end of lap 1${st.value.gridSource === "first_position" ? " (grid inferred from the position feed)" : ""}.`,
      numbers: [{ label: b.driver.name_acronym, value: `P${b.grid} → P${b.afterLap1}` }, ...(w ? [{ label: w.driver.name_acronym, value: `P${w.grid} → P${w.afterLap1}` }] : [])],
      evidence: { tab: "overview", sectionId: SECTION_IDS.start, drivers: [b.driver.driver_number] },
      drivers: [b.driver.driver_number],
    });
  }
  const cv = conversionAnalysis(model);
  if (cv.ok && cv.value.overperformer && (cv.value.overperformer.paceToFinish ?? 0) >= 3) {
    const o = cv.value.overperformer;
    out.push({
      id: "overperformer", area: "overview", impact: 42, confidence: cv.confidence,
      headline: `${o.driver.name_acronym} finished P${o.finish} with the ${ordinal(o.paceRank as number)}-fastest car.`,
      detail: "Finishing position against the fuel-corrected race-pace rank — strategy, track position or others' misfortune made up the difference.",
      numbers: [{ label: "Finish", value: `P${o.finish}` }, { label: "Pace rank", value: `P${o.paceRank}` }],
      evidence: { tab: "overview", sectionId: SECTION_IDS.gridFinish, drivers: [o.driver.driver_number] },
      drivers: [o.driver.driver_number],
      kpi: { label: "Overperformer", value: o.driver.name_acronym, sub: `P${o.finish} from P${o.paceRank} pace`, accent: "warn" },
    });
  }

  // --- Data quality --------------------------------------------------------------
  if (model.fuel.source === "fitted") {
    out.push({
      id: "fuel_model_fitted", area: "strategy", impact: 10, confidence: "medium",
      headline: `Fuel effect fitted from the race: ${(model.fuel.secPerKg * 1000).toFixed(0)} ms per kg.`,
      detail: `${model.fuel.fitPairs} same-compound, equal-tyre-age lap pairs across stints; the textbook 55 ms/kg is the fallback when a race has too few.`,
      numbers: [{ label: "s/kg", value: model.fuel.secPerKg.toFixed(3) }, { label: "Pairs", value: String(model.fuel.fitPairs) }],
      evidence: { tab: "strategy", sectionId: SECTION_IDS.fuel },
    });
  }
  const gaps = model.warnings.filter(w => /not available|not published/i.test(w));
  if (gaps.length) {
    out.push({
      id: "data_quality", area: "overview", impact: 5, confidence: "high",
      headline: `Some timing feeds were missing for this session, so the affected cards say so rather than guess.`,
      detail: gaps.join(" "),
      numbers: [{ label: "Missing", value: String(gaps.length) }],
      evidence: { tab: "overview", sectionId: SECTION_IDS.verdicts },
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
