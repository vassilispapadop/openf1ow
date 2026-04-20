import { useMemo, type ReactNode } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import type { ViewKey } from "../../lib/constants";
import { F, M, C } from "../../lib/styles";
import { ft3, podiumColor } from "../../lib/format";
import {
  computeSlowLapThreshold,
  isCleanLap,
  median,
  fuelCorrPerLap,
  stintDegradation,
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

  const ranked = results
    .filter(r => r.position && r.driver_number)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const p1 = ranked[0];
  const p2 = ranked[1];
  const winnerDrv = p1 ? drvMap[p1.driver_number!] : null;
  const winner = winnerDrv ? { driver: winnerDrv, gap: p2?.gap_to_leader || "" } : null;

  let bestLap = Infinity;
  let bestLapDn = -1;
  for (const l of allLaps) {
    if (!l.lap_duration || l.lap_duration <= 0 || l.is_pit_out_lap) continue;
    if (l.lap_duration < bestLap) { bestLap = l.lap_duration; bestLapDn = l.driver_number; }
  }
  const fastestLapDrv = bestLapDn !== -1 ? drvMap[bestLapDn] : null;
  const fastestLap = fastestLapDrv ? { driver: fastestLapDrv, time: bestLap } : null;

  const totalRaceLaps = Math.max(...allLaps.map(l => l.lap_number), 1);
  const fuelCorr = fuelCorrPerLap(totalRaceLaps);
  const lapMap: Record<string, Lap> = {};
  allLaps.forEach(l => { lapMap[l.driver_number + "-" + l.lap_number] = l; });

  const degAcc: Record<number, { weighted: number; laps: number }> = {};
  for (const st of stints) {
    const res = stintDegradation(st, lapMap, threshold, fuelCorr);
    if (!res) continue;
    const acc = degAcc[st.driver_number] ||= { weighted: 0, laps: 0 };
    acc.weighted += res.deg * res.usable.length;
    acc.laps += res.usable.length;
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

function Card({ label, accent, teamColor, primary, secondary, onClick }: {
  label: string;
  accent: string;
  teamColor: string;
  primary: string;
  secondary: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="hover-border-strong"
      style={{
        flex: "1 1 200px",
        minWidth: 200,
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid " + C.border,
        background: C.surface,
        cursor: onClick ? "pointer" : "default",
        color: "inherit",
        fontFamily: F,
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: C.textMute,
        marginBottom: 10,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
        <span>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          width: 3, alignSelf: "stretch", borderRadius: 2, background: teamColor, flexShrink: 0,
          minHeight: 18,
        }} />
        <span style={{
          fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.015em",
        }}>{primary}</span>
      </div>
      <div style={{
        fontSize: 12, fontFamily: M, color: C.textDim, fontWeight: 500,
        paddingLeft: 11,
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
  onOpenTab?: (tab: ViewKey) => void;
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
        accent={podiumColor(0)}
        teamColor={"#" + (insights.winner.driver.team_colour || "666")}
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
        label="Fastest lap"
        accent={C.violet}
        teamColor={"#" + (insights.fastestLap.driver.team_colour || "666")}
        primary={insights.fastestLap.driver.name_acronym}
        secondary={ft3(insights.fastestLap.time)}
        onClick={onOpenTab && (() => onOpenTab("pace"))}
      />,
    );
  }
  if (insights.tyreMaster) {
    cards.push(
      <Card
        key="tyre"
        label="Tyre master"
        accent={C.pos}
        teamColor={"#" + (insights.tyreMaster.driver.team_colour || "666")}
        primary={insights.tyreMaster.driver.name_acronym}
        secondary={`+${(insights.tyreMaster.degPerLap * 1000).toFixed(0)} ms/lap deg`}
        onClick={onOpenTab && (() => onOpenTab("strategy"))}
      />,
    );
  }
  if (insights.overperformer) {
    const { finishPos, paceRank, delta } = insights.overperformer;
    cards.push(
      <Card
        key="overperformer"
        label="Overperformer"
        accent={C.warn}
        teamColor={"#" + (insights.overperformer.driver.team_colour || "666")}
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
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 18,
    }}>
      {cards}
    </div>
  );
}
