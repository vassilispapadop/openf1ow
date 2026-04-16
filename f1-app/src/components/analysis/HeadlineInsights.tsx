import { useMemo, type ReactNode } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import { F, M } from "../../lib/styles";
import { ft3 } from "../../lib/format";
import {
  computeSlowLapThreshold,
  isCleanLap,
  median,
  linearSlope,
  FUEL_TOTAL_KG,
  FUEL_SEC_PER_KG,
} from "../../lib/raceUtils";

interface RaceResult {
  position?: number;
  driver_number?: number;
  gap_to_leader?: string;
  status?: string;
}

interface Insights {
  winner: { driver: Driver; gap: string } | null;
  fastestLap: { driver: Driver; time: number } | null;
  tyreMaster: { driver: Driver; degPerLap: number } | null;
  overperformer: { driver: Driver; paceRank: number; finishPos: number; delta: number } | null;
}

function computeInsights(
  allLaps: Lap[],
  drivers: Driver[],
  stints: Stint[],
  results: RaceResult[],
): Insights {
  const drvMap: Record<number, Driver> = {};
  drivers.forEach(d => { drvMap[d.driver_number] = d; });
  const threshold = computeSlowLapThreshold(allLaps);

  // Winner: P1 finisher, with gap derived from P2's gap_to_leader (= margin of victory)
  const ranked = results
    .filter(r => r.position && r.driver_number)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const p1 = ranked[0];
  const p2 = ranked[1];
  const winnerDrv = p1 ? drvMap[p1.driver_number!] : null;
  const winner = winnerDrv
    ? { driver: winnerDrv, gap: p2?.gap_to_leader || "" }
    : null;

  // Fastest lap across all drivers (ignore pit-out laps)
  let bestLap = Infinity;
  let bestLapDn = -1;
  for (const l of allLaps) {
    if (!l.lap_duration || l.lap_duration <= 0 || l.is_pit_out_lap) continue;
    if (l.lap_duration < bestLap) { bestLap = l.lap_duration; bestLapDn = l.driver_number; }
  }
  const fastestLapDrv = bestLapDn !== -1 ? drvMap[bestLapDn] : null;
  const fastestLap = fastestLapDrv ? { driver: fastestLapDrv, time: bestLap } : null;

  // Tyre master: lowest fuel-corrected degradation across a driver's stints,
  // weighted by usable laps. Requires sustained stint data to avoid noise.
  const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
  const fuelCorrPerLap = (FUEL_TOTAL_KG / totalRaceLaps) * FUEL_SEC_PER_KG;
  const lapMap: Record<string, Lap> = {};
  allLaps.forEach(l => { lapMap[l.driver_number + "-" + l.lap_number] = l; });

  const degAcc: Record<number, { weighted: number; laps: number }> = {};
  for (const st of stints) {
    const clean: Lap[] = [];
    for (let ln = st.lap_start; ln <= st.lap_end; ln++) {
      const l = lapMap[st.driver_number + "-" + ln];
      if (l && isCleanLap(l, threshold)) clean.push(l);
    }
    const usable = clean.filter(l => l.lap_number - st.lap_start >= 2);
    if (usable.length < 3) continue;
    const xs = usable.map(l => l.lap_number - st.lap_start);
    const ys = usable.map(l => l.lap_duration! + (l.lap_number - 1) * fuelCorrPerLap);
    const deg = Math.max(0, linearSlope(xs, ys));
    const acc = degAcc[st.driver_number] || (degAcc[st.driver_number] = { weighted: 0, laps: 0 });
    acc.weighted += deg * usable.length;
    acc.laps += usable.length;
  }
  let tyreMasterDn = -1;
  let tyreMasterDeg = Infinity;
  for (const [dnStr, { weighted, laps }] of Object.entries(degAcc)) {
    if (laps < 8) continue;
    const avg = weighted / laps;
    if (avg < tyreMasterDeg) { tyreMasterDeg = avg; tyreMasterDn = Number(dnStr); }
  }
  const tyreMaster = tyreMasterDn !== -1 && drvMap[tyreMasterDn]
    ? { driver: drvMap[tyreMasterDn], degPerLap: tyreMasterDeg }
    : null;

  // Overperformer: biggest positive (pace_rank − finish_position) delta.
  // A driver who was P8 on pure pace but finished P3 scores +5.
  const paceByDriver: { dn: number; med: number }[] = [];
  const cleanByDriver: Record<number, number[]> = {};
  for (const l of allLaps) {
    if (!isCleanLap(l, threshold)) continue;
    (cleanByDriver[l.driver_number] ||= []).push(l.lap_duration!);
  }
  for (const [dnStr, times] of Object.entries(cleanByDriver)) {
    if (times.length < 3) continue;
    paceByDriver.push({ dn: Number(dnStr), med: median(times) });
  }
  paceByDriver.sort((a, b) => a.med - b.med);
  const paceRank: Record<number, number> = {};
  paceByDriver.forEach((r, i) => { paceRank[r.dn] = i + 1; });

  let overperformer: Insights["overperformer"] = null;
  for (const r of ranked) {
    if (r.status && r.status !== "Finished") continue;
    const pr = paceRank[r.driver_number!];
    const fp = r.position!;
    if (!pr) continue;
    const delta = pr - fp;
    if (delta > 0 && (!overperformer || delta > overperformer.delta) && drvMap[r.driver_number!]) {
      overperformer = { driver: drvMap[r.driver_number!], paceRank: pr, finishPos: fp, delta };
    }
  }

  return { winner, fastestLap, tyreMaster, overperformer };
}

interface CardProps {
  label: string;
  accent: string;
  driver: Driver;
  primary: string;
  secondary: ReactNode;
  onClick?: () => void;
}

function Card({ label, accent, driver, primary, secondary, onClick }: CardProps) {
  const teamColor = "#" + (driver.team_colour || "666");
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 180px",
        minWidth: 180,
        textAlign: "left" as const,
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(12,12,24,0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderLeft: `3px solid ${accent}`,
        cursor: onClick ? "pointer" : "default",
        color: "inherit",
        fontFamily: F,
        transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        position: "relative" as const,
        overflow: "hidden" as const,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px ${accent}22`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: accent,
        textTransform: "uppercase" as const,
        letterSpacing: "1px",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 2, background: teamColor, flexShrink: 0,
          boxShadow: `0 0 8px ${teamColor}66`,
        }} />
        <span style={{
          fontSize: 20, fontWeight: 800, fontFamily: F, color: "#e8e8ec", letterSpacing: "0.3px",
        }}>{primary}</span>
      </div>
      <div style={{
        fontSize: 11, fontFamily: M, color: "#b0b0c0", fontWeight: 500,
      }}>{secondary}</div>
    </button>
  );
}

export default function HeadlineInsights({
  allLaps, drivers, stints, results, onOpenTab,
}: {
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  results: RaceResult[];
  onOpenTab?: (tab: string) => void;
}) {
  const insights = useMemo(
    () => computeInsights(allLaps, drivers, stints, results),
    [allLaps, drivers, stints, results],
  );

  const cards: ReactNode[] = [];
  if (insights.winner) {
    cards.push(
      <Card
        key="winner"
        label="Winner"
        accent="#FFD700"
        driver={insights.winner.driver}
        primary={insights.winner.driver.name_acronym}
        secondary={insights.winner.gap ? `Margin ${insights.winner.gap}` : "Race winner"}
        onClick={onOpenTab && (() => onOpenTab("pace"))}
      />,
    );
  }
  if (insights.fastestLap) {
    cards.push(
      <Card
        key="fastest"
        label="Fastest Lap"
        accent="#a855f7"
        driver={insights.fastestLap.driver}
        primary={insights.fastestLap.driver.name_acronym}
        secondary={ft3(insights.fastestLap.time)}
        onClick={onOpenTab && (() => onOpenTab("evolution"))}
      />,
    );
  }
  if (insights.tyreMaster) {
    cards.push(
      <Card
        key="tyre"
        label="Tyre Master"
        accent="#22c55e"
        driver={insights.tyreMaster.driver}
        primary={insights.tyreMaster.driver.name_acronym}
        secondary={`+${(insights.tyreMaster.degPerLap * 1000).toFixed(0)} ms/lap deg`}
        onClick={onOpenTab && (() => onOpenTab("degradation"))}
      />,
    );
  }
  if (insights.overperformer) {
    const { finishPos, paceRank, delta } = insights.overperformer;
    cards.push(
      <Card
        key="overperformer"
        label="Overperformer"
        accent="#f97316"
        driver={insights.overperformer.driver}
        primary={insights.overperformer.driver.name_acronym}
        secondary={`P${finishPos} from P${paceRank} pace (+${delta})`}
        onClick={onOpenTab && (() => onOpenTab("pace"))}
      />,
    );
  }

  if (!cards.length) return null;

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap" as const,
      gap: 10,
      marginBottom: 12,
    }}>
      {cards}
    </div>
  );
}
