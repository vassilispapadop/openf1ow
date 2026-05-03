import { useEffect, useState } from "react";
import { F, C, R } from "../../lib/styles";
import { fd } from "../../lib/format";
import { loadRaceIndex } from "../../lib/raceIndex";
import { loadSeasonTrends } from "../../lib/seasonClient";
import { paths } from "../../lib/constants";
import type { ConstructorPaceRace } from "../../lib/seasonUtils";

interface LatestRace {
  year: number;
  slug: string;
  meetingKey: number;
  raceSk: number | null;
  meetingName: string;
  location: string;
  country: string;
  dateStart: string;
  fastestTeam?: string;
  fastestTeamGap?: string;
  poleTeam?: string;          // P1 in the constructor-pace ranking, if available
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
        meetingKey: latest.meetingKey,
        raceSk: latest.sessions?.race ?? null,
        meetingName: latest.meetingName,
        location: latest.location,
        country: latest.country,
        dateStart: latest.dateStart,
        fastestTeam: trendRow?.teams[0]?.team,
        fastestTeamGap: trendRow?.teams[1]
          ? `+${trendRow.teams[1].gapToFastest.toFixed(3)}s`
          : undefined,
        poleTeam: trendRow?.teams[0]?.team,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (loading) {
    return (
      <div style={{ ...wrapperStyle, height: 220 }} aria-busy="true" />
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
  const recapHref = `/recap/${race.year}/${race.slug}`;
  const analysisHref = race.raceSk
    ? paths.analysis(race.year, String(race.meetingKey), String(race.raceSk))
    : `/${race.year}/${race.meetingKey}`;
  const trendsHref = `/${race.year}/trends`;

  return (
    <div style={{ ...wrapperStyle }}>
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, letterSpacing: "0.12em", marginBottom: 10 }}>
        LATEST · {formatted.toUpperCase()}
      </div>
      <h2 style={{
        fontSize: "clamp(32px, 5.5vw, 52px)",
        fontWeight: 800,
        margin: "0 0 12px",
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
        color: C.text,
      }}>
        {race.meetingName}
      </h2>
      <div style={{ fontSize: 14, color: C.textDim, marginBottom: 22, lineHeight: 1.5 }}>
        {race.location}, {race.country}
        {race.fastestTeam && (
          <>
            {" · "}
            <span style={{ color: C.text, fontWeight: 600 }}>{race.fastestTeam}</span>
            {race.fastestTeamGap && (
              <span style={{ color: C.textMute }}> {race.fastestTeamGap} ahead of P2</span>
            )}
          </>
        )}
      </div>
      <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
      }}>
        <CtaPill href={recapHref} accent="primary">
          Race recap
        </CtaPill>
        <CtaPill href={analysisHref}>
          Full analysis & AI verdict
        </CtaPill>
        <CtaPill href={trendsHref}>
          {race.year} season trends
        </CtaPill>
      </div>
    </div>
  );
}

function CtaPill({ href, accent, children }: { href: string; accent?: "primary" | "default"; children: React.ReactNode }) {
  const isPrimary = accent === "primary";
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "9px 16px",
        background: isPrimary ? C.accent : "transparent",
        color: isPrimary ? "#fff" : C.text,
        border: isPrimary ? "none" : "1px solid " + C.border,
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
        fontFamily: F,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={e => {
        if (!isPrimary) e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
      }}
      onMouseLeave={e => {
        if (!isPrimary) e.currentTarget.style.borderColor = C.border;
      }}
    >
      {children} →
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
