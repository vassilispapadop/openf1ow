import { useCallback, useEffect, useState } from "react";
import { F, C, R } from "../../lib/styles";
import { shareUrl, canShareUrl } from "../../lib/share";
import { fd } from "../../lib/format";
import { findLatestRace } from "../../lib/latestRace";
import { loadSeasonTrends } from "../../lib/seasonClient";
import { fetchInsights } from "../../lib/api";
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
  verdicts?: { id: string; headline: string; confidence: string; tab: string }[];
  podium?: { pos: number; driver: string; team: string; gap: string | number | null; grid: number | null }[];
}

export default function LatestRaceCard({ year }: { year: number }) {
  const [race, setRace] = useState<LatestRace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await findLatestRace(year);
      if (!latest || cancelled) { setLoading(false); return; }

      const trends = await loadSeasonTrends(year);
      const trendRow: ConstructorPaceRace | undefined = trends?.constructorPace.find(
        c => c.slug === latest.slug,
      );

      // The engine's top findings for the race, from the Worker-side run.
      let verdicts: LatestRace["verdicts"] = undefined;
      let podium: LatestRace["podium"] = undefined;
      if (latest.raceSk) {
        try {
          const ins = await fetchInsights(latest.raceSk);
          const results = (ins?.tables?.results ?? []) as NonNullable<LatestRace["podium"]>;
          if (Array.isArray(results) && results.length) podium = results.filter(r => r.pos != null && r.pos <= 3);
          verdicts = (ins?.verdicts ?? [])
            .filter((v: any) => v.id !== "data_quality" && v.id !== "race_winner")
            .slice(0, 3)
            .map((v: any) => ({ id: v.id, headline: v.headline, confidence: v.confidence, tab: v.evidence?.tab ?? "overview" }));
        } catch { /* card still renders without them */ }
      }

      if (cancelled) return;
      setRace({
        verdicts,
        podium,
        year,
        slug: latest.slug,
        meetingKey: latest.meetingKey,
        raceSk: latest.raceSk,
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
      {race.podium && race.podium.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {race.podium.map(p => (
            <div key={p.pos} style={{ flex: "1 1 160px", padding: "10px 12px", borderRadius: 10, background: C.surfaceAlt, border: "1px solid " + C.border, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: p.pos === 1 ? "#FFD700" : p.pos === 2 ? "#C0C0C0" : "#CD7F32", fontFamily: "var(--mono)" }}>P{p.pos}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{p.driver}</span>
              <span style={{ fontSize: 11, color: C.textMute, marginLeft: "auto", fontFamily: "var(--mono)" }}>{p.pos === 1 ? (p.grid != null ? `from P${p.grid}` : "") : typeof p.gap === "number" ? `+${p.gap.toFixed(3)}` : p.gap ?? ""}</span>
            </div>
          ))}
        </div>
      )}
      {race.verdicts && race.verdicts.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gap: 8 }}>
          {race.verdicts.map(v => (
            <li key={v.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: C.text, lineHeight: 1.45 }}>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: C.accent, flexShrink: 0, minHeight: 16 }} aria-hidden="true" />
              <a href={race.raceSk ? paths.analysis(race.year, String(race.meetingKey), String(race.raceSk), v.tab as any) : analysisHref}
                style={{ color: "inherit", textDecoration: "none" }}>{v.headline}</a>
            </li>
          ))}
        </ul>
      )}
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
        <ShareCta url={`${typeof window !== "undefined" ? window.location.origin : "https://www.openf1ow.com"}${recapHref}`} title={`${race.meetingName} — F1 race analysis`} />
      </div>
    </div>
  );
}

// One-tap share of the race recap. Native share sheet on mobile, clipboard copy
// on desktop — the low-friction path that turns a race page into a referral.
function ShareCta({ url, title }: { url: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");
  const onClick = useCallback(async () => {
    if (canShareUrl()) {
      const ok = await shareUrl({ url, title });
      if (ok) { setStatus("shared"); setTimeout(() => setStatus("idle"), 2000); return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch { /* ignore */ }
    setTimeout(() => setStatus("idle"), 2000);
  }, [url, title]);

  const label = status === "copied" ? "Link copied" : status === "shared" ? "Shared" : "Share";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 16px",
        background: "transparent",
        color: C.text,
        border: "1px solid " + C.border,
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: F,
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
      aria-label="Share this race"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
      </svg>
      {label}
    </button>
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
