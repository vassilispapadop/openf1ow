// Verdicts for qualifying and practice. Single-lap sessions have their own
// questions — who has the ultimate lap in them, how much the track came to
// the field, what the top ten start on — and none of the race ones.

import type { SessionModel } from "../types/model.ts";
import type { Verdict } from "./types.ts";
import { bestLapsByDriver } from "../analyses/quali.ts";
import { longRuns, compoundPrograms } from "../analyses/practice.ts";
import { sessionClock, pushLaps, trackEvolution, sectorBests, teammateSingleLap } from "../analyses/singleLap.ts";
import { topSpeeds } from "../analyses/speeds.ts";

type Ids = Record<string, string>;

const lapTime = (v: number) => { const m = Math.floor(v / 60); return m > 0 ? `${m}:${(v - m * 60).toFixed(3).padStart(6, "0")}` : v.toFixed(3); };
const s3 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3) + " s";
const lower = (s: string | null | undefined) => (s ? s.toLowerCase() : "");

export function singleLapVerdicts(model: SessionModel, ids: Ids): Verdict[] {
  const out: Verdict[] = [];
  const quali = model.kind === "qualifying";
  const clock = sessionClock(model);

  // --- Headline lap --------------------------------------------------------------
  const best = bestLapsByDriver(model);
  if (best.ok && best.value.length) {
    const [p1, p2] = best.value;
    out.push({
      id: quali ? "pole" : "fastest_practice_lap", area: "overview", impact: 100, confidence: "high",
      headline: quali
        ? `${p1.driver.name_acronym} took pole with ${lapTime(p1.bestLap)}${p2 ? `, ${p2.gapToPole.toFixed(3)} s clear of ${p2.driver.name_acronym}` : ""}${p1.compound ? ` on the ${lower(p1.compound)}` : ""}.`
        : `${p1.driver.name_acronym} topped the session with ${lapTime(p1.bestLap)}${p2 ? `, ${p2.gapToPole.toFixed(3)} s ahead of ${p2.driver.name_acronym}` : ""}${p1.compound ? ` on the ${lower(p1.compound)}` : ""}.`,
      detail: quali
        ? `Best timed lap per driver excluding pit-out laps and the first lap out. ${p1.lapsCompleted} timed laps for ${p1.driver.name_acronym}, best on lap ${p1.lap.lap_number}.`
        : "Best timed lap per driver. Practice fuel loads and run plans differ, so the order says who did a quali simulation as much as who is quick.",
      numbers: [{ label: p1.driver.name_acronym, value: lapTime(p1.bestLap) }, ...(p2 ? [{ label: p2.driver.name_acronym, value: s3(p2.gapToPole) }] : []), ...(p1.compound ? [{ label: "Tyre", value: p1.compound }] : [])],
      evidence: { tab: "overview", sectionId: ids.bestLaps, drivers: [p1.driver.driver_number, ...(p2 ? [p2.driver.driver_number] : [])] },
      drivers: [p1.driver.driver_number],
      kpi: { label: quali ? "Pole" : "Fastest", value: p1.driver.name_acronym, sub: lapTime(p1.bestLap), accent: "gold" },
    });
    if (p2 && best.value.length >= 3) {
      const p3 = best.value[2];
      const tight = p3.gapToPole <= 0.1;
      if (tight || p2.gapToPole >= 0.3) out.push({
        id: "front_row_margin", area: "overview", impact: 70, confidence: "high",
        headline: tight
          ? `The top three were covered by ${p3.gapToPole.toFixed(3)} s.`
          : `${p1.driver.name_acronym} was in a class of one: ${p2.gapToPole.toFixed(3)} s to the next car.`,
        detail: `Gaps between each driver's best lap. ${(p2.gapPct).toFixed(2)} % to P2, ${(p3.gapPct).toFixed(2)} % to P3.`,
        numbers: [{ label: "P2", value: s3(p2.gapToPole) }, { label: "P3", value: s3(p3.gapToPole) }],
        evidence: { tab: "overview", sectionId: ids.bestLaps, drivers: [p1.driver.driver_number, p2.driver.driver_number, p3.driver.driver_number] },
        drivers: [p1.driver.driver_number, p2.driver.driver_number, p3.driver.driver_number],
        kpi: { label: "Margin to P2", value: "+" + p2.gapToPole.toFixed(3), sub: `${p2.driver.name_acronym} · P3 +${p3.gapToPole.toFixed(3)} ${p3.driver.name_acronym}`, accent: "warn" },
      });
    }
  }

  // --- Sectors ---------------------------------------------------------------------
  const sb = sectorBests(model);
  if (sb.ok) {
    const v = sb.value;
    const kingNames = v.kings.map(k => k?.name_acronym ?? "—");
    const under = v.pole - v.ultimateLap;
    out.push({
      id: "ultimate_lap", area: "pace", impact: 66, confidence: sb.confidence,
      headline: `The ultimate lap was ${lapTime(v.ultimateLap)} — ${under.toFixed(3)} s under ${quali ? "pole" : "the best lap"}: S1 ${kingNames[0]}, S2 ${kingNames[1]}, S3 ${kingNames[2]}.`,
      detail: "The field's best time in each sector added together. Nobody drives it, but it says where the lap was won and who owned each part of the track.",
      numbers: [{ label: "Ultimate", value: lapTime(v.ultimateLap) }, { label: "S1", value: `${kingNames[0]} ${v.fieldBests[0].toFixed(3)}` }, { label: "S2", value: `${kingNames[1]} ${v.fieldBests[1].toFixed(3)}` }, { label: "S3", value: `${kingNames[2]} ${v.fieldBests[2].toFixed(3)}` }],
      evidence: { tab: "pace", sectionId: ids.sectorBests, drivers: v.kings.filter((k): k is NonNullable<typeof k> => !!k).map(k => k.driver_number) },
      drivers: v.kings.filter((k): k is NonNullable<typeof k> => !!k).map(k => k.driver_number),
      kpi: { label: "Ultimate lap", value: lapTime(v.ultimateLap), sub: `${under.toFixed(3)} s under ${quali ? "pole" : "P1"}`, accent: "violet" },
    });
    const left = v.rows.slice(0, 10).filter(r => r.leftOnTable >= 0.15).sort((a, b) => b.leftOnTable - a.leftOnTable)[0];
    if (left) out.push({
      id: "left_on_table", area: "pace", impact: 58, confidence: "medium",
      headline: `${left.driver.name_acronym} left ${left.leftOnTable.toFixed(3)} s on the table: their best sectors add up to ${lapTime(left.theoretical)}${left.theoreticalRank < left.actualRank ? `, good for P${left.theoreticalRank} instead of P${left.actualRank}` : ""}.`,
      detail: "A driver's own best sector times summed against their best complete lap. The sectors need not be from the same run or tyre, so treat it as an upper bound.",
      numbers: [{ label: "Best lap", value: lapTime(left.best) }, { label: "Theoretical", value: lapTime(left.theoretical) }, { label: "Gap", value: left.leftOnTable.toFixed(3) + " s" }],
      evidence: { tab: "pace", sectionId: ids.sectorBests, drivers: [left.driver.driver_number] },
      drivers: [left.driver.driver_number],
    });
  }

  // --- Top speed -------------------------------------------------------------------
  const sp = topSpeeds(model);
  if (sp.ok && sp.value.fieldBest.trap) {
    const t = sp.value.fieldBest.trap;
    const slowest = sp.value.teams[sp.value.teams.length - 1];
    out.push({
      id: "top_speed", area: "pace", impact: 46, confidence: sp.confidence,
      headline: `${t.driver.name_acronym} had the top speed: ${Math.round(t.speed)} km/h through the trap on lap ${t.lap}${sp.value.teams.length > 1 && slowest.trap ? `, ${Math.round(t.speed - slowest.trap.speed)} km/h more than the slowest team` : ""}.`,
      detail: "Best speed-trap reading on a timed lap. In qualifying a tow from a car ahead is worth several km/h, and the timing feed does not publish intervals here, so readings are not split by traffic.",
      numbers: [{ label: t.driver.name_acronym, value: Math.round(t.speed) + " km/h" }, { label: "Fastest team", value: sp.value.teams[0]?.team ?? "—" }, ...(slowest?.trap ? [{ label: "Slowest team", value: `${slowest.team} ${Math.round(slowest.trap.speed)}` }] : [])],
      evidence: { tab: "pace", sectionId: ids.topSpeeds, drivers: [t.driver.driver_number] },
      drivers: [t.driver.driver_number],
      kpi: { label: "Top speed", value: Math.round(t.speed) + " km/h", sub: `${t.driver.name_acronym} · lap ${t.lap}`, accent: "accent" },
    });
  }

  // --- Track evolution -------------------------------------------------------------
  const te = trackEvolution(model, clock);
  if (te.ok) {
    const v = te.value;
    const quicker = v.secPerMin < 0;
    const perTen = Math.abs(v.secPerMin * 10);
    const q1 = v.phaseBests[0]?.best, qn = v.phaseBests[v.phaseBests.length - 1]?.best;
    const phaseStory = quali && q1 != null && qn != null && v.phaseBests.length > 1
      ? ` The best ${v.phaseBests[v.phaseBests.length - 1].phase.name} lap was ${(q1 - qn).toFixed(3)} s quicker than the best ${v.phaseBests[0].phase.name} lap.`
      : "";
    out.push({
      id: "track_evolution", area: "track", impact: te.confidence === "low" ? 30 : 54, confidence: te.confidence,
      headline: te.confidence === "low"
        ? `The track did not evolve measurably over the session (${s3(v.secPerMin * 10)} per 10 min, interval spans zero).`
        : `The track came to the field: push laps got ${perTen.toFixed(3)} s ${quicker ? "quicker" : "slower"} every 10 minutes, about ${Math.abs(v.totalGain).toFixed(2)} s over the session.`,
      detail: `Push laps (within ${((1.03 - 1) * 100).toFixed(0)} % of each driver's own best) regressed on session time with a fixed effect per driver, so who ran when does not masquerade as grip. ${v.n} laps from ${v.drivers} drivers; 95 % interval ${s3(v.ci95[0] * 10)} to ${s3(v.ci95[1] * 10)} per 10 min.${phaseStory}`,
      numbers: [{ label: "Per 10 min", value: s3(v.secPerMin * 10) }, { label: "Over session", value: s3(v.totalGain) }, { label: "n", value: `${v.n} laps` }],
      evidence: { tab: "track", sectionId: ids.trackEvolution },
      kpi: te.confidence === "low" ? undefined : { label: "Track evolution", value: s3(v.secPerMin * 10), sub: "per 10 min, push laps", accent: "accent" },
    });
  }

  // --- Teammates -------------------------------------------------------------------
  const tm = teammateSingleLap(model, clock);
  if (tm.ok && tm.value.length) {
    // A gap over 3 % is conditions (one wet lap, one dry), not driving.
    const comparable = tm.value.filter(p => p.gapPct <= 3);
    const uncomparable = tm.value.filter(p => p.gapPct > 3);
    const widest = comparable[0];
    const closest = comparable[comparable.length - 1];
    if (uncomparable.length) out.push({
      id: "teammates_different_conditions", area: "battles", impact: 36, confidence: "high",
      headline: `${uncomparable.map(p => p.team).join(", ")}: teammates set their best laps in different conditions, so the single-lap gap says nothing.`,
      detail: `Best laps ${uncomparable.map(p => `${p.a.name_acronym} ${lapTime(p.bestA)} / ${p.b.name_acronym} ${lapTime(p.bestB)}`).join("; ")} — over 3 % apart, which no car explains.`,
      numbers: uncomparable.slice(0, 3).map(p => ({ label: p.team, value: p.gap.toFixed(1) + " s" })),
      evidence: { tab: "battles", sectionId: ids.teammatesSingleLap, drivers: uncomparable.flatMap(p => [p.a.driver_number, p.b.driver_number]) },
      drivers: uncomparable.flatMap(p => [p.a.driver_number, p.b.driver_number]),
    });
    if (widest && widest.gap >= 0.2) out.push({
      id: "teammate_single_lap_gap", area: "battles", impact: 56, confidence: widest.phases.filter(p => p.delta != null).length >= 2 ? "high" : "medium",
      headline: `${widest.faster.name_acronym} beat ${widest.slower.name_acronym} by ${widest.gap.toFixed(3)} s on their best laps${widest.winsA + widest.winsB >= 2 ? `, and was ahead in ${Math.max(widest.winsA, widest.winsB)} of ${widest.winsA + widest.winsB} segments` : ""} — the widest gap in any team.`,
      detail: `Best lap against best lap in the same car${quali ? ", plus best-in-segment for every segment both drivers ran" : ""}.${widest.longRunDelta ? ` On the ${lower(widest.longRunDelta.compound)} long run, ${widest.faster.name_acronym} was ${Math.abs(widest.longRunDelta.delta).toFixed(3)} s a lap ${(widest.longRunDelta.delta < 0) === (widest.faster.driver_number === widest.a.driver_number) ? "quicker" : "slower"}.` : ""}`,
      numbers: [{ label: widest.a.name_acronym, value: lapTime(widest.bestA) }, { label: widest.b.name_acronym, value: lapTime(widest.bestB) }, { label: "Gap", value: widest.gap.toFixed(3) + " s" }],
      evidence: { tab: "battles", sectionId: ids.teammatesSingleLap, drivers: [widest.a.driver_number, widest.b.driver_number] },
      drivers: [widest.a.driver_number, widest.b.driver_number],
    });
    if (closest && closest !== widest && closest.gap <= 0.05) out.push({
      id: "teammate_single_lap_closest", area: "battles", impact: 40, confidence: "high",
      headline: `${closest.team} were split by ${closest.gap.toFixed(3)} s — the closest pairing in the field.`,
      detail: "Best lap against best lap in the same car.",
      numbers: [{ label: closest.a.name_acronym, value: lapTime(closest.bestA) }, { label: closest.b.name_acronym, value: lapTime(closest.bestB) }],
      evidence: { tab: "battles", sectionId: ids.teammatesSingleLap, drivers: [closest.a.driver_number, closest.b.driver_number] },
      drivers: [closest.a.driver_number, closest.b.driver_number],
    });
  }

  // --- Qualifying: start tyres and progression ----------------------------------------
  if (quali && best.ok) {
    const top10 = best.value.slice(0, 10);
    const byC: Record<string, number> = {};
    for (const r of top10) if (r.compound) byC[r.compound] = (byC[r.compound] ?? 0) + 1;
    const cs = Object.entries(byC).sort((a, b) => b[1] - a[1]);
    if (cs.length) {
      const [main, n] = cs[0];
      const others = top10.filter(r => r.compound && r.compound !== main);
      out.push({
        id: "start_tyre_split", area: "strategy", impact: 50, confidence: model.coverage.stints ? "medium" : "low",
        headline: others.length
          ? `${n} of the top ${top10.length} set their best lap on the ${lower(main)}; ${others.map(r => r.driver.name_acronym).join(", ")} on the ${others.map(r => lower(r.compound)).filter((c, i, a) => a.indexOf(c) === i).join(" / ")}.`
          : `All ${top10.length} of the top ${top10.length} set their best lap on the ${lower(main)}.`,
        detail: "The compound fitted on each driver's best lap, from the stint feed. Under the current rules the top ten choose their race start tyre freely, so read this as the tyre each car was quickest on, not a strategy commitment.",
        numbers: cs.map(([c, k]) => ({ label: c, value: String(k) })),
        evidence: { tab: "strategy", sectionId: ids.startTyres, drivers: others.map(r => r.driver.driver_number) },
        drivers: others.map(r => r.driver.driver_number),
      });
    }
    const pl = pushLaps(model, clock);
    if (pl.ok && clock && clock.phases.length >= 2) {
      const last = clock.phases[clock.phases.length - 1];
      const inFinal = pl.value.filter(d => d.phaseBests[last.index] != null);
      const improvers = inFinal.map(d => {
        const prev = d.phaseBests.slice(0, last.index).filter((v): v is number => v != null);
        return prev.length ? { d, gain: Math.min(...prev) - (d.phaseBests[last.index] as number) } : null;
      // A gain over 3 % of the lap is a change of conditions, not of driving.
      }).filter((x): x is NonNullable<typeof x> => !!x && x.gain <= 0.03 * (x.d.phaseBests[last.index] as number)).sort((a, b) => b.gain - a.gain);
      if (improvers.length && improvers[0].gain >= 0.25) {
        const top = improvers[0];
        out.push({
          id: "final_segment_step", area: "pace", impact: 44, confidence: "medium",
          headline: `${top.d.driver.name_acronym} found ${top.gain.toFixed(3)} s in ${last.name} over their earlier best.`,
          detail: `Best lap in ${last.name} against the best of the earlier segments. Track evolution, fuel and a fresh set account for some of it; the rest is the driver.`,
          numbers: [{ label: last.name, value: lapTime(top.d.phaseBests[last.index] as number) }, { label: "Earlier best", value: lapTime((top.d.phaseBests[last.index] as number) + top.gain) }],
          evidence: { tab: "pace", sectionId: ids.sessionEvolution, drivers: [top.d.driver.driver_number] },
          drivers: [top.d.driver.driver_number],
        });
      }
    }
  }

  // --- Practice: long runs and programmes ---------------------------------------------
  if (!quali) {
    const lr = longRuns(model);
    if (lr.ok && lr.value.length) {
      const top = lr.value[0];
      const second = lr.value.find(r => r.driver.driver_number !== top.driver.driver_number);
      out.push({
        id: "long_run_leader", area: "strategy", impact: 72, confidence: lr.confidence,
        headline: `${top.driver.name_acronym} had the best long run: ${lapTime(top.medianPace)} median over ${top.laps.length} laps on the ${lower(top.compound)}${second ? `, ${(second.medianPace - top.medianPace).toFixed(3)} s a lap up on ${second.driver.name_acronym}` : ""}.`,
        detail: `Stints of ${6}+ clean laps after the out-lap, ranked on the median. Raw times — practice fuel loads are unknown — so a light car can flatter a run.${top.fit ? ` Slope ${(top.fit.slope * 1000).toFixed(0)} ms/lap over the run.` : ""}`,
        numbers: [{ label: top.driver.name_acronym, value: lapTime(top.medianPace) }, { label: "Laps", value: String(top.laps.length) }, { label: "Tyre", value: top.compound }],
        evidence: { tab: "strategy", sectionId: ids.longRuns, drivers: [top.driver.driver_number] },
        drivers: [top.driver.driver_number],
        kpi: { label: "Long-run pace", value: top.driver.name_acronym, sub: `${lapTime(top.medianPace)} · ${top.laps.length} laps ${lower(top.compound)}`, accent: "pos" },
      });
    }
    const cp = compoundPrograms(model);
    if (cp.ok && cp.value.length) {
      const total: Record<string, number> = {};
      let all = 0;
      for (const p of cp.value) for (const [c, n] of Object.entries(p.byCompound)) { total[c] = (total[c] ?? 0) + n; all += n; }
      const most = cp.value[0];
      const ranked = Object.entries(total).sort((a, b) => b[1] - a[1]);
      if (ranked.length) out.push({
        id: "compound_focus", area: "strategy", impact: 38, confidence: "high",
        headline: `${Math.round(ranked[0][1] / all * 100)} % of the field's ${all} laps were on the ${lower(ranked[0][0])}; ${most.driver.name_acronym} ran the most laps (${most.totalLaps}).`,
        detail: `Laps per compound summed across every driver's stints — the field's programme for the session.`,
        numbers: ranked.slice(0, 4).map(([c, n]) => ({ label: c, value: `${n} laps` })),
        evidence: { tab: "strategy", sectionId: ids.compoundProgram, drivers: [most.driver.driver_number] },
        drivers: [most.driver.driver_number],
        kpi: { label: "Most laps", value: most.driver.name_acronym, sub: `${most.totalLaps} laps`, accent: "warn" },
      });
    }
  }

  return out;
}
