// Classification per driver. session_result gives position (null for a
// retirement), dnf/dns/dsq, number_of_laps and gap_to_leader (seconds or
// "+1 LAP"). When results are missing the retirement is inferred: a car whose
// last lap is three or more laps before the winner's, with no chequered lap,
// did not finish.

import type { Driver, Lap, SessionResultRow } from "../types/raw.ts";
import type { Classification } from "../types/model.ts";

export function classifyDrivers(
  drivers: Driver[],
  laps: Lap[],
  results: SessionResultRow[] | null | undefined,
  kind: "race" | "qualifying" | "practice" | "unknown",
): { byDriver: Record<number, Classification>; totalLaps: number; fromResults: boolean } {
  const lastLap: Record<number, number> = {};
  let maxLap = 0;
  for (const l of laps) {
    lastLap[l.driver_number] = Math.max(lastLap[l.driver_number] ?? 0, l.lap_number);
    if (l.lap_number > maxLap) maxLap = l.lap_number;
  }

  const byDriver: Record<number, Classification> = {};
  const rows = results ?? [];
  const fromResults = rows.length > 0;

  if (fromResults) {
    for (const r of rows) {
      const dnf = !!r.dnf, dns = !!r.dns, dsq = !!r.dsq;
      const legacy = (r.status || "").toLowerCase();
      const status: Classification["status"] =
        dsq || legacy.includes("disqual") ? "dsq"
        : dns || legacy.includes("not start") ? "dns"
        : dnf || legacy.includes("retire") || (kind === "race" && r.position == null) ? "retired"
        : "finished";
      const lapsCompleted = r.number_of_laps ?? lastLap[r.driver_number] ?? 0;
      byDriver[r.driver_number] = {
        position: r.position ?? null,
        status,
        lapsCompleted,
        retiredLap: status === "retired" ? lapsCompleted : null,
        gapToLeader: r.gap_to_leader ?? null,
        points: r.points ?? null,
      };
    }
  }

  // Winner's lap count for a race; otherwise the most laps anyone ran.
  let totalLaps = maxLap;
  if (kind === "race" && fromResults) {
    const winner = rows.find(r => r.position === 1);
    if (winner?.number_of_laps) totalLaps = winner.number_of_laps;
  }

  for (const d of drivers) {
    if (byDriver[d.driver_number]) continue;
    const completed = lastLap[d.driver_number] ?? 0;
    const retired = kind === "race" && completed > 0 && totalLaps - completed >= 3;
    byDriver[d.driver_number] = {
      position: null,
      status: kind === "race" ? (completed === 0 ? "dns" : retired ? "retired" : "unknown") : "unknown",
      lapsCompleted: completed,
      retiredLap: retired ? completed : null,
      gapToLeader: null,
      points: null,
    };
  }

  return { byDriver, totalLaps, fromResults };
}
