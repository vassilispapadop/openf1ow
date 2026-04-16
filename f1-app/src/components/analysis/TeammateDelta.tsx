import { useMemo, useRef } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import ShareButton from "../ShareButton";

function TeammateDelta({ allLaps, drivers }: {
  allLaps: Lap[];
  drivers: Driver[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const teamPairs = useMemo(() => {
    // Group drivers by team
    const teams: Record<string, Driver[]> = {};
    drivers.forEach(d => {
      const t = d.team_name || "Unknown";
      if (!teams[t]) teams[t] = [];
      teams[t].push(d);
    });

    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    // Clean-lap threshold (drops SC/traffic/pit laps) — keeps the comparison
    // representative of racing pace, not situational laps.
    const threshold = computeSlowLapThreshold(allLaps);

    return Object.entries(teams)
      .filter(([_, ds]) => ds.length >= 2)
      .map(([team, ds]) => {
        // Take first two drivers per team
        const [d1, d2] = ds.slice(0, 2);
        const laps1 = (lapMap[d1.driver_number] || []).filter(l => isCleanLap(l, threshold));
        const laps2 = (lapMap[d2.driver_number] || []).filter(l => isCleanLap(l, threshold));

        // Find common laps (both drivers have clean data on the same lap)
        const l1Map: Record<number, number> = {};
        laps1.forEach(l => { l1Map[l.lap_number] = l.lap_duration!; });
        const t1Common: number[] = [];
        const t2Common: number[] = [];
        const commonPairs: { lap: number; t1: number; t2: number }[] = [];
        laps2.forEach(l => {
          if (l1Map[l.lap_number]) {
            t1Common.push(l1Map[l.lap_number]);
            t2Common.push(l.lap_duration!);
            commonPairs.push({ lap: l.lap_number, t1: l1Map[l.lap_number], t2: l.lap_duration! });
          }
        });

        if (commonPairs.length < 3) return null;

        // Median is robust to outlier laps (a single traffic lap doesn't flip
        // the ranking the way a mean would).
        const med1 = median(t1Common);
        const med2 = median(t2Common);

        const d1Faster = med1 <= med2;
        const faster = d1Faster ? d1 : d2;
        const slower = d1Faster ? d2 : d1;
        const fasterMed = d1Faster ? med1 : med2;
        const slowerMed = d1Faster ? med2 : med1;
        const gap = slowerMed - fasterMed; // always non-negative

        return {
          team,
          faster, slower,
          commonLaps: commonPairs.length,
          gap,
          fasterAvg: fasterMed, slowerAvg: slowerMed,
          color: d1.team_colour || "666",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.gap - b!.gap) as NonNullable<typeof teamPairs[number]>[];
  }, [allLaps, drivers]);

  if (!teamPairs.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>Need 2+ drivers per team</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ShareButton domRef={contentRef} filename="openf1ow-teammates" />
      </div>
      <div ref={contentRef}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
      {teamPairs.map(tp => (
          <div key={tp.team} style={{
            ...sty.card,
            borderTop: "3px solid #" + tp.color,
            marginBottom: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#" + tp.color, marginBottom: 10, letterSpacing: "0.5px" }}>
              {tp.team}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontFamily: F,
                  color: "#22c55e",
                }}>{tp.faster.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.fasterAvg)}</div>
                <div style={{ fontSize: 9, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>FASTER</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 12px" }}>
                <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 2 }}>GAP</div>
                <div style={{
                  fontSize: 18, fontWeight: 800, fontFamily: M,
                  color: tp.gap < 0.1 ? "#b0b0c0" : "#e10600",
                }}>+{tp.gap.toFixed(3)}s</div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: F }}>{tp.slower.name_acronym}</div>
                <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0", marginTop: 2 }}>{ft3(tp.slowerAvg)}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", textAlign: "center" }}>
              {tp.commonLaps} comparable laps
            </div>
          </div>
      ))}
    </div>
    </div>
    </div>
  );
}

export default TeammateDelta;
