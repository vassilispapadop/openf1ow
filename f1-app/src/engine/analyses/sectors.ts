// Sector analysis with one meaning per word. "Theoretical best" is a
// driver's own best three sectors added together; the field's ultimate lap is
// labelled separately. Consistency is a real coefficient of variation.
// Speed traps are split by traffic state, because a tow is a tow.

import type { SessionModel, EnrichedLap } from "../types/model.ts";
import type { Driver } from "../types/raw.ts";
import { type Gated, ok, gate, confidenceFromN } from "../types/gated.ts";
import { median, sampleStd, mean } from "../stats.ts";
import { GATES, DIRTY_AIR_THRESHOLD, DRS_RANGE_THRESHOLD } from "../gates.ts";

export interface SectorRow {
  driver: Driver;
  team: string;
  n: number;
  medians: [number, number, number];
  bests: [number, number, number];
  theoretical: number;               // own best sectors summed
  deltas: [number, number, number];  // median − field best median, per sector
  totalDelta: number;
  cov: [number, number, number];     // sampleStd / mean per sector, as a fraction
  trapClear: number | null;          // best st_speed on laps with gapAhead ≥ 1.5 s (or unknown gap)
  trapTow: number | null;            // best st_speed on laps with gapAhead < 1.0 s
  trapMedian: number | null;
}

export interface SectorAnalysis {
  rows: SectorRow[];                 // ranked by totalDelta
  fieldBestMedians: [number, number, number];
  fieldBestSectors: [number, number, number];
  ultimateLap: number;               // sum of fieldBestSectors
  kings: [Driver, Driver, Driver];   // fastest median per sector
}

function sectors(l: EnrichedLap): [number, number, number] | null {
  const s1 = l.duration_sector_1, s2 = l.duration_sector_2, s3 = l.duration_sector_3;
  return s1 && s2 && s3 ? [s1, s2, s3] : null;
}

export function sectorAnalysis(model: SessionModel): Gated<SectorAnalysis> {
  const per: { d: typeof model.drivers[number]; secs: [number, number, number][]; laps: EnrichedLap[] }[] = [];
  for (const d of model.drivers) {
    const usable = d.laps.filter(l => l.clean);
    const secs = usable.map(sectors).filter((s): s is [number, number, number] => !!s);
    if (secs.length >= GATES.SECTOR_MIN) per.push({ d, secs, laps: usable });
  }
  if (!per.length) return gate("too_few_laps", 0, GATES.SECTOR_MIN);

  const rowsRaw = per.map(({ d, secs, laps }) => {
    const col = (i: 0 | 1 | 2) => secs.map(s => s[i]);
    const medians: [number, number, number] = [median(col(0)), median(col(1)), median(col(2))];
    const bests: [number, number, number] = [Math.min(...col(0)), Math.min(...col(1)), Math.min(...col(2))];
    const cov: [number, number, number] = [0, 1, 2].map(i => {
      const c = col(i as 0 | 1 | 2);
      return sampleStd(c) / mean(c);
    }) as [number, number, number];
    const traps = laps.filter(l => l.st_speed != null);
    const clear = traps.filter(l => l.gapAhead == null || l.gapAhead >= DIRTY_AIR_THRESHOLD).map(l => l.st_speed as number);
    const tow = traps.filter(l => l.gapAhead != null && l.gapAhead < DRS_RANGE_THRESHOLD).map(l => l.st_speed as number);
    return {
      driver: d.driver, team: d.team, n: secs.length, medians, bests,
      theoretical: bests[0] + bests[1] + bests[2],
      deltas: [0, 0, 0] as [number, number, number], totalDelta: 0, cov,
      trapClear: clear.length ? Math.max(...clear) : null,
      trapTow: tow.length ? Math.max(...tow) : null,
      trapMedian: traps.length ? median(traps.map(l => l.st_speed as number)) : null,
    };
  });

  const fieldBestMedians: [number, number, number] = [0, 1, 2].map(i =>
    Math.min(...rowsRaw.map(r => r.medians[i as 0 | 1 | 2]))) as [number, number, number];
  const fieldBestSectors: [number, number, number] = [0, 1, 2].map(i =>
    Math.min(...rowsRaw.map(r => r.bests[i as 0 | 1 | 2]))) as [number, number, number];
  for (const r of rowsRaw) {
    r.deltas = [0, 1, 2].map(i => r.medians[i as 0 | 1 | 2] - fieldBestMedians[i as 0 | 1 | 2]) as [number, number, number];
    r.totalDelta = r.deltas[0] + r.deltas[1] + r.deltas[2];
  }
  rowsRaw.sort((a, b) => a.totalDelta - b.totalDelta);
  const king = (i: 0 | 1 | 2) => rowsRaw.reduce((m, r) => (r.medians[i] < m.medians[i] ? r : m), rowsRaw[0]).driver;

  return ok({
    rows: rowsRaw,
    fieldBestMedians,
    fieldBestSectors,
    ultimateLap: fieldBestSectors[0] + fieldBestSectors[1] + fieldBestSectors[2],
    kings: [king(0), king(1), king(2)],
  }, rowsRaw.length, confidenceFromN(rowsRaw.length, 6));
}
