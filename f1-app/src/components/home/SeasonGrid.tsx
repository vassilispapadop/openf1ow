// Compact race chip grid for the homepage. Replaces the auto-redirect-only
// pattern in the old HomePage with explicit links — clicking a race goes to
// the recap page (full-content landing for SEO), where users can drill into
// the live SPA analysis.

import { useEffect, useState } from "react";
import { F, C, R } from "../../lib/styles";
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

  if (!races) return <div style={{ height: 200 }} />;

  return (
    <section style={{ marginTop: 36, fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: C.textMute,
          textTransform: "uppercase",
          margin: 0,
        }}>
          {year} Calendar
        </h3>
        <a href={`/${year}/trends`} style={{ fontSize: 12, color: C.textDim, textDecoration: "none" }}>
          Season trends →
        </a>
      </div>
      <ul style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
      }}>
        {races.map(r => (
          <li key={r.slug}>
            <a
              href={`/recap/${year}/${r.slug}`}
              className="card-glow"
              style={{
                display: "block",
                padding: "10px 14px",
                background: r.isPast ? C.surface : "transparent",
                border: "1px solid " + C.border,
                borderRadius: R.md,
                color: "inherit",
                textDecoration: "none",
                opacity: r.isPast ? 1 : 0.55,
              }}
            >
              <div style={{
                fontSize: 10,
                color: C.textMute,
                fontWeight: 600,
                letterSpacing: "0.08em",
                marginBottom: 4,
                fontVariantNumeric: "tabular-nums",
              }}>
                {r.dateStart ? new Date(r.dateStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                {!r.isPast && <span style={{ color: C.warn, marginLeft: 6 }}>upcoming</span>}
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
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
