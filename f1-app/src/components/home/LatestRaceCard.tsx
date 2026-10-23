// Latest race card — flat, data-forward.
// No gradients, no decorative chrome. Just the facts.

import { useCallback, useEffect, useState } from "react";
import { shareUrl, canShareUrl } from "../../lib/share";
import { fd } from "../../lib/format";
import { paths, type ViewKey } from "../../lib/constants";
import { findLatestRace } from "../../lib/latestRace";
import { loadSeasonTrends } from "../../lib/seasonClient";
import { fetchInsights } from "../../lib/api";
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
  verdicts?: { id: string; headline: string; confidence: string; tab: string }[];
  podium?: { pos: number; driver: string; dn?: number; team: string; gap: string | number | null; grid: number | null }[];
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
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year]);

  if (loading) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 24, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</span>
      </div>
    );
  }
  if (!race) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>
          {String(year).toUpperCase()}
        </div>
        <div style={{ fontSize: 16, color: "var(--text-muted)" }}>
          No completed races yet.
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
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "24px 28px",
    }}>
      {/* Date header — flat, minimal */}
      <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6 }}>
        {formatted.toUpperCase()}
      </div>

      {/* Race name — large, bold */}
      <h2 style={{
        fontSize: "clamp(28px, 5vw, 42px)",
        fontWeight: 800,
        margin: "0 0 6px",
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
        color: "var(--text)",
      }}>
        {race.meetingName}
      </h2>

      {/* Location + fastest team — muted */}
      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
        {race.location}, {race.country}
        {race.fastestTeam && (
          <>
            {" · "}
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{race.fastestTeam}</span>
            {race.fastestTeamGap && (
              <span style={{ color: "var(--text-muted)" }}> {race.fastestTeamGap}</span>
            )}
          </>
        )}
      </div>

      {/* Podium — flat tiles, bold position numbers */}
      {race.podium && race.podium.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {race.podium.map(p => {
            const medalColor = p.pos === 1 ? "#FFD700" : p.pos === 2 ? "#C0C0C0" : "#CD7F32";
            const href = p.dn != null && race.raceSk
              ? paths.driver(race.year, String(race.meetingKey), String(race.raceSk), String(p.dn))
              : null;
            const tile = (
              <>
                <span style={{ fontSize: 16, fontWeight: 800, color: medalColor, minWidth: 24 }}>P{p.pos}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 }}>{p.driver}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
                  {p.pos === 1 ? (p.grid != null ? `from P${p.grid}` : "") : typeof p.gap === "number" ? `+${p.gap.toFixed(3)}` : p.gap ?? ""}
                </span>
              </>
            );
            const style: React.CSSProperties = {
              flex: "1 1 150px",
              padding: "8px 10px",
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              textDecoration: "none",
              transition: "border-color 0.15s ease",
            };
            return href ? (
              <a key={p.pos} href={href} style={style}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>{tile}</a>
            ) : <div key={p.pos} style={style}>{tile}</div>;
          })}
        </div>
      )}

      {/* Key insights — minimal list */}
      {race.verdicts && race.verdicts.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
          {race.verdicts.map(v => (
            <li key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>
              <span style={{ width: 2, alignSelf: "stretch", borderRadius: 1, background: "var(--accent)", flexShrink: 0, marginTop: 6 }} aria-hidden="true" />
              <a href={race.raceSk ? paths.analysis(race.year, String(race.meetingKey), String(race.raceSk), v.tab as ViewKey) : analysisHref}
                style={{ color: "inherit", textDecoration: "none" }}>{v.headline}</a>
            </li>
          ))}
        </ul>
      )}

      {/* Actions — flat buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a href={recapHref} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 14px",
          background: "var(--accent)", color: "#fff",
          borderRadius: "var(--radius-sm)",
          fontSize: 12, fontWeight: 600,
          textDecoration: "none",
        }}>Race recap</a>
        <a href={analysisHref} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 14px",
          background: "transparent", color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12, fontWeight: 600,
          textDecoration: "none",
        }}>Analysis</a>
        <a href={trendsHref} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 14px",
          background: "transparent", color: "var(--text-muted)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12, fontWeight: 500,
          textDecoration: "none",
        }}>{race.year} trends</a>
        <ShareCta url={`${typeof window !== "undefined" ? window.location.origin : ""}${recapHref}`} title={`${race.meetingName} — F1 race analysis`} />
      </div>
    </div>
  );
}

// ── Share button ────────────────────────────────────────────────────
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
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 12px",
        background: "transparent", color: "var(--text-muted)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: 11, fontWeight: 500,
        cursor: "pointer",
        transition: "border-color 0.15s ease, color 0.15s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
      </svg>
      {label}
    </button>
  );
}
