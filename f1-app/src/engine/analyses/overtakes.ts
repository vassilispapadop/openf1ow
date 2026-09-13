// Overtakes from the OpenF1 feed, classified: on-track, a pit-cycle swap
// (either car in or out of the pits on that lap), un-lapping, or a restart
// pass on the first lap after a neutralisation. Without the feed, a
// position-feed diff stands in with low confidence.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate } from "../types/gated.ts";
import { LapFlag, hasFlag } from "../types/model.ts";
import { parseTs } from "../session/timeline.ts";

export type OvertakeKind = "on-track" | "pit-cycle" | "lapping" | "un-lapping" | "under-sc" | "restart";

export interface ClassifiedOvertake {
  t: number;
  lap: number | null;
  overtaker: Driver;
  overtaken: Driver;
  position: number;
  kind: OvertakeKind;
}

export interface DriverOvertakes { driver: Driver; team: string; made: number; suffered: number; net: number; onTrackMade: number; onTrackSuffered: number }

export interface OvertakeAnalysis {
  events: ClassifiedOvertake[];
  byDriver: DriverOvertakes[];         // by net on-track, best first
  byLap: Record<number, number>;       // on-track passes per lap
  totals: Record<OvertakeKind, number>;
  source: "overtakes" | "position";
}

function lapAt(laps: EnrichedLap[], t: number): EnrichedLap | null {
  let best: EnrichedLap | null = null;
  for (const l of laps) if (Number.isFinite(l.tStart) && l.tStart <= t && (!best || l.tStart > best.tStart)) best = l;
  return best;
}

export function overtakeAnalysis(model: SessionModel): Gated<OvertakeAnalysis> {
  if (model.kind !== "race") return gate("wrong_session_kind");
  const events: ClassifiedOvertake[] = [];
  const source: OvertakeAnalysis["source"] = model.coverage.overtakes ? "overtakes" : "position";

  if (source === "overtakes") {
    for (const o of model.overtakes) {
      const a = model.byDriver[o.overtaking_driver_number], b = model.byDriver[o.overtaken_driver_number];
      if (!a || !b) continue;
      const t = parseTs(o.date);
      const la = lapAt(a.laps, t), lb = lapAt(b.laps, t);
      let kind: OvertakeKind = "on-track";
      const pitFlags = LapFlag.PIT_IN | LapFlag.PIT_OUT;
      const underSc = model.neutralisations.some(n => n.kind !== "YELLOW" && t >= n.tStart && t <= n.tEnd);
      if (underSc) kind = "under-sc";                                             // pit shuffles behind the safety car
      else if ((la && hasFlag(la.flags, pitFlags)) || (lb && hasFlag(lb.flags, pitFlags))) kind = "pit-cycle";
      else if (la && lb && la.lap_number > lb.lap_number) kind = "lapping";        // a leader passing a car a lap down
      else if (la && lb && la.lap_number < lb.lap_number) kind = "un-lapping";     // a lapped car re-passing
      else if ((la && hasFlag(la.flags, LapFlag.RESTART)) || model.neutralisations.some(n => n.kind !== "YELLOW" && t >= n.tEnd && t <= n.tEnd + 120_000)) kind = "restart";
      events.push({ t, lap: la?.lap_number ?? null, overtaker: a.driver, overtaken: b.driver, position: o.position, kind });
    }
  } else {
    if (!model.coverage.position) return gate("no_data");
    // Position diff per lap: a car whose position improves while another's
    // worsens on the same lap. Cheap and approximate — flagged low.
    for (let lap = 2; lap <= model.totalLaps; lap++) {
      const cur = model.lapsByNumber[lap] ?? [];
      for (const l of cur) {
        const prev = model.lapByKey[`${l.driver_number}-${lap - 1}`];
        if (l.position == null || prev?.position == null || l.position >= prev.position) continue;
        for (let p = l.position; p < prev.position; p++) {
          const victim = cur.find(x => x.position === p + 1 && x.driver_number !== l.driver_number);
          if (!victim) continue;
          const a = model.byDriver[l.driver_number], b = model.byDriver[victim.driver_number];
          if (!a || !b || !Number.isFinite(l.tStart)) continue;
          const kind: OvertakeKind = hasFlag(l.flags | victim.flags, LapFlag.PIT_IN | LapFlag.PIT_OUT) ? "pit-cycle" : "on-track";
          events.push({ t: l.tStart, lap, overtaker: a.driver, overtaken: b.driver, position: p, kind });
        }
      }
    }
  }
  if (!events.length) return gate("no_data");
  events.sort((a, b) => a.t - b.t);

  const totals: Record<OvertakeKind, number> = { "on-track": 0, "pit-cycle": 0, lapping: 0, "un-lapping": 0, "under-sc": 0, restart: 0 };
  const byLap: Record<number, number> = {};
  const per: Record<number, DriverOvertakes> = {};
  for (const d of model.drivers) per[d.driver.driver_number] = { driver: d.driver, team: d.team, made: 0, suffered: 0, net: 0, onTrackMade: 0, onTrackSuffered: 0 };
  for (const e of events) {
    totals[e.kind]++;
    const a = per[e.overtaker.driver_number], b = per[e.overtaken.driver_number];
    if (a) { a.made++; if (e.kind === "on-track") a.onTrackMade++; }
    if (b) { b.suffered++; if (e.kind === "on-track") b.onTrackSuffered++; }
    if (e.kind === "on-track" && e.lap != null) byLap[e.lap] = (byLap[e.lap] ?? 0) + 1;
  }
  const byDriver = Object.values(per).map(r => ({ ...r, net: r.onTrackMade - r.onTrackSuffered })).sort((a, b) => b.net - a.net);
  return ok({ events, byDriver, byLap, totals, source }, events.length, source === "overtakes" ? "high" : "low",
    source === "position" ? ["Inferred from the position feed — the overtakes feed was not available."] : undefined);
}
