// Season grid — flat grid of race chips.
// No decorative chrome, just past and upcoming races.

import { useEffect, useState } from "react";
import { fd } from "../../lib/format";
import { loadRaceIndex } from "../../lib/raceIndex";

interface RaceChip {
  slug: string;
  meetingName: string;
  location: string;
  dateStart: string;
  isPast: boolean;
}

export default function SeasonGrid({ year }: { year: number }) {
  const [races, setRaces] = useState<RaceChip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idx = await loadRaceIndex();
      if (cancelled || !idx) return;
      const list = idx.byYear[String(year)] || [];
      const now = Date.now();
      const enriched: RaceChip[] = list
        .filter(r => r.sessions?.race)
        .sort((a, b) => (a.dateStart || "").localeCompare(b.dateStart || ""))
        .map(r => ({
          slug: r.slug,
          meetingName: r.meetingName,
          location: r.location,
          dateStart: r.dateStart,
          isPast: r.dateStart ? new Date(r.dateStart).getTime() < now : false,
        }));
      setRaces(enriched);
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (!races) return <div style={{ height: 200, marginTop: 28 }} aria-busy="true" />;

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--text-faint)", margin: 0, textTransform: "uppercase",
        }}>
          {year} Calendar
        </h3>
        <a href={`/${year}/trends`} style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}>
          Season trends →
        </a>
      </div>
      <ul style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: 8,
      }}>
        {races.map(r => (
          <li key={r.slug}>
            <a
              href={`/recap/${year}/${r.slug}`}
              style={{
                display: "block", padding: "10px 14px",
                background: r.isPast ? "var(--surface)" : "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "inherit", textDecoration: "none",
                opacity: r.isPast ? 1 : 0.55,
                transition: "border-color 0.15s ease, opacity 0.15s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = r.isPast ? "1" : "0.55"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <div style={{
                fontSize: 10, color: "var(--text-muted)",
                fontWeight: 600, letterSpacing: "0.08em",
                marginBottom: 4, fontVariantNumeric: "tabular-nums",
              }}>
                {fd(r.dateStart, { day: "2-digit", month: "short" })}
                {!r.isPast && <span style={{ color: "var(--accent)", marginLeft: 4 }}>upcoming</span>}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--text)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {r.location}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
