// The drivers of the session, each a link into their driver page. Driver
// pages (every lap and sector, the telemetry of any lap, stints and pit stops)
// are where readers spend the longest, yet they were only reachable through
// the "Driver view" toggle; this card puts them on the overview itself.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSessionModel } from "../../lib/useSessionModel";
import { useSession } from "../../contexts/SessionContext";
import { bestLapFor, SECTION_IDS, type DriverSummary } from "../../engine/index.ts";
import { fmt } from "../../charts/core/scales";
import { Section } from "../../ui";
import { paths } from "../../lib/constants";
import { C, F, M } from "../../lib/styles";

interface Row {
  d: DriverSummary;
  /** Classification position for a race; best-lap rank otherwise. */
  rank: number | null;
  /** Gap to the leader (race) or the best lap time (other sessions). */
  stat: string;
}

const gapText = (gap: number | string | null): string => {
  if (gap == null) return "";
  if (typeof gap === "number") return fmt.signedSec(gap, 3);
  return gap;
};

export default function DriversCard() {
  const { model } = useSessionModel();
  const { year, mk, sk } = useSession();

  const rows = useMemo<Row[]>(() => {
    if (!model) return [];
    const race = model.kind === "race";
    const classified = model.drivers.some(d => d.classification.position != null);
    const bestOf = (d: DriverSummary) => bestLapFor(model, d.driver.driver_number);
    const bestText = (d: DriverSummary) => { const b = bestOf(d); return b?.lap_duration ? fmt.lapTime(b.lap_duration) : "no lap"; };
    if (classified) {
      return model.drivers
        .slice()
        .sort((a, b) => (a.classification.position ?? 99) - (b.classification.position ?? 99))
        .map(d => {
          const c = d.classification;
          // A race reads as the result (gap to the winner); a qualifying or
          // practice classification reads as the driver's best lap.
          const stat = !race ? bestText(d)
            : c.position === 1 ? "winner"
            : c.status === "finished" || c.status === "unknown" ? gapText(c.gapToLeader)
            : c.status.toUpperCase();
          return { d, rank: c.position, stat };
        });
    }
    // No classification: order by best lap.
    const withBest = model.drivers.map(d => ({ d, best: bestOf(d) }));
    withBest.sort((a, b) => (a.best?.lap_duration ?? Infinity) - (b.best?.lap_duration ?? Infinity));
    return withBest.map(({ d, best }, i) => ({ d, rank: best ? i + 1 : null, stat: bestText(d) }));
  }, [model]);

  if (!model || rows.length === 0 || !sk) return null;

  return (
    <Section
      id={SECTION_IDS.drivers}
      kicker={`${rows.length} drivers`}
      title="Drivers"
      hint="Open a driver for every lap and sector, the telemetry of any lap, stints and pit stops, position lap by lap — and to compare laps between drivers."
    >
      <div style={{
        display: "grid",
        // 150px fits two tiles across a phone; wider screens get five or six.
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 6,
      }}>
        {rows.map(({ d, rank, stat }) => {
          const drv = d.driver;
          const color = "#" + (drv.team_colour || "666");
          return (
            <Link
              key={drv.driver_number}
              to={paths.driver(year, mk, sk, String(drv.driver_number))}
              title={`${drv.full_name} — laps, telemetry, stints`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "7px 10px 7px 7px",
                borderRadius: 10,
                border: "1px solid " + C.border,
                borderLeft: `3px solid ${color}`,
                background: C.surfaceAlt,
                textDecoration: "none",
                color: C.text,
                fontFamily: F,
                minWidth: 0,
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderStrong; e.currentTarget.style.borderLeftColor = color; e.currentTarget.style.background = C.surfaceHi; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = color; e.currentTarget.style.background = C.surfaceAlt; }}
            >
              <span style={{ width: 22, textAlign: "right", fontSize: 11, fontWeight: 600, fontFamily: M, color: C.textMute, flexShrink: 0 }}>
                {rank != null ? `P${rank}` : "—"}
              </span>
              {drv.headshot_url ? (
                <img src={drv.headshot_url} alt="" width={28} height={28} loading="lazy" style={{
                  width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                  boxShadow: `inset 0 0 0 2px ${color}`,
                }} />
              ) : (
                <span style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: `${color}24`, color, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, fontFamily: M,
                }}>{drv.driver_number}</span>
              )}
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{drv.name_acronym}</span>
                <span style={{ fontSize: 11, color: C.textMute, fontFamily: M, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stat}</span>
              </span>
              <span style={{ fontSize: 13, color: C.textMute, flexShrink: 0 }} aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
