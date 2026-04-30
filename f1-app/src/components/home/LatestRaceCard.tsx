import { useEffect, useState } from "react";
import { F, C, R } from "../../lib/styles";
import { fd } from "../../lib/format";
import { loadRaceIndex } from "../../lib/raceIndex";
import { loadSeasonTrends } from "../../lib/seasonClient";
import type { ConstructorPaceRace } from "../../lib/seasonUtils";

interface LatestRace {
  year: number;
  slug: string;
  meetingName: string;
  location: string;
  country: string;
  dateStart: string;
  fastestTeam?: string;
  fastestTeamGap?: string;
}

export default function LatestRaceCard({ year }: { year: number }) {
  const [race, setRace] = useState<LatestRace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idx = await loadRaceIndex();
      if (!idx || cancelled) { setLoading(false); return; }
      const list = idx.byYear[String(year)];
      if (!list) { setLoading(false); return; }
      const now = Date.now();
      const past = list
        .filter(r => r.sessions?.race && r.dateStart && new Date(r.dateStart).getTime() < now)
        .sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""));
      const latest = past[0];
      if (!latest) { setLoading(false); return; }

      const trends = await loadSeasonTrends(year);
      const trendRow: ConstructorPaceRace | undefined = trends?.constructorPace.find(
        c => c.slug === latest.slug,
      );

      if (cancelled) return;
      setRace({
        year,
        slug: latest.slug,
        meetingName: latest.meetingName,
        location: latest.location,
        country: latest.country,
        dateStart: latest.dateStart,
        fastestTeam: trendRow?.teams[0]?.team,
        fastestTeamGap: trendRow?.teams[1]
          ? `+${trendRow.teams[1].gapToFastest.toFixed(3)}s`
          : undefined,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (loading) {
    return (
      <div style={{ ...wrapperStyle, height: 168 }} aria-busy="true" />
    );
  }
  if (!race) {
    return (
      <div style={wrapperStyle}>
        <div style={{ fontSize: 12, color: C.textMute, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>
          {String(year).toUpperCase()} SEASON
        </div>
        <div style={{ fontSize: 18, color: C.textDim, fontFamily: F }}>
          No completed races yet — pick a session below.
        </div>
      </div>
    );
  }

  const formatted = fd(race.dateStart);

  return (
    <a
      href={`/recap/${race.year}/${race.slug}`}
      className="card-glow"
      style={{
        ...wrapperStyle,
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, letterSpacing: "0.12em", marginBottom: 10 }}>
        LATEST · {formatted.toUpperCase()}
      </div>
      <h2 style={{
        fontSize: "clamp(28px, 5vw, 44px)",
        fontWeight: 800,
        margin: "0 0 10px",
        lineHeight: 1.05,
        letterSpacing: "-0.025em",
        color: C.text,
      }}>
        {race.meetingName}
      </h2>
      <div style={{ fontSize: 14, color: C.textDim, marginBottom: 18 }}>
        {race.location}, {race.country}
        {race.fastestTeam && (
          <>
            {" · "}
            <span style={{ color: C.text, fontWeight: 600 }}>{race.fastestTeam}</span>
            {race.fastestTeamGap && (
              <span style={{ color: C.textMute }}> {race.fastestTeamGap} ahead</span>
            )}
          </>
        )}
      </div>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: C.accent,
        letterSpacing: "0.02em",
      }}>
        Read the recap →
      </div>
    </a>
  );
}

const wrapperStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceAlt} 100%)`,
  border: "1px solid " + C.border,
  borderRadius: R.lg,
  padding: "clamp(20px, 4vw, 32px)",
  fontFamily: F,
  transition: "border-color 0.15s ease",
};
