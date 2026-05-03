import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { F, C, R, sty } from "../lib/styles";
import { loadSeasonTrends } from "../lib/seasonClient";
import type { SeasonTrends } from "../lib/seasonUtils";
import ConstructorPaceEvolution from "../components/season/ConstructorPaceEvolution";
import TeammateGapEvolution from "../components/season/TeammateGapEvolution";
import TireDegByCompound from "../components/season/TireDegByCompound";
import ShareButton from "../components/ShareButton";
import Spinner from "../components/Spinner";

export default function SeasonTrendsPage() {
  const params = useParams<{ year?: string }>();
  const year = Number(params.year) || new Date().getFullYear();
  const [trends, setTrends] = useState<SeasonTrends | null | "missing">(null);
  const constructorPaceRef = useRef<HTMLElement>(null);
  const teammateGapRef = useRef<HTMLElement>(null);
  const tireDegRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setTrends(null);
    loadSeasonTrends(year).then(t => {
      if (cancelled) return;
      setTrends(t ?? "missing");
    });
    return () => { cancelled = true; };
  }, [year]);

  if (trends === null) {
    return (
      <div className="fade-in" style={{ padding: 40 }}>
        <Spinner label={`Loading ${year} season trends…`} />
      </div>
    );
  }

  if (trends === "missing") {
    return (
      <div className="fade-in" style={{ padding: 40, fontFamily: F, color: C.textDim }}>
        <h1 style={{ fontSize: 24, color: C.text, marginBottom: 12 }}>{year} season trends</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 540 }}>
          No precomputed trends for {year} yet. The artifact is built by{" "}
          <code style={{ ...sty.mono, background: C.surface, padding: "2px 6px", borderRadius: 4 }}>
            npm run trends -- --year {year}
          </code>
          {" "}— it reads OpenF1 data, runs the season-level aggregations, and uploads to R2.
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in-up" style={{ fontFamily: F, padding: "clamp(12px, 3vw, 24px) 0" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: C.textMute,
          marginBottom: 8,
        }}>
          SEASON TRENDS · {trends.raceCount} RACES
        </div>
        <h1 style={{
          fontSize: "clamp(28px, 5vw, 44px)",
          fontWeight: 800,
          margin: 0,
          letterSpacing: "-0.025em",
          color: C.text,
        }}>
          {year} F1 — pace, gaps, degradation
        </h1>
        <p style={{ fontSize: 14, color: C.textDim, margin: "8px 0 0", maxWidth: 720 }}>
          Cross-race trends derived from clean-lap medians and fuel-corrected stint deg.
          Lower gap = closer to the fastest car. Click a team in the legend to isolate it.
        </p>
      </header>

      <section ref={constructorPaceRef} style={{ ...sty.card, padding: "clamp(16px, 3vw, 24px)" }}>
        <header style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>
              Constructor pace evolution
            </h2>
            <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0" }}>
              Median lap-time gap to the fastest car, per race. Top 3 highlighted; hover the chart for
              the full ranking at any round.
            </p>
          </div>
          <ShareButton domRef={constructorPaceRef} meta={`${year} constructor pace`} filename={`openf1ow-constructor-pace-${year}`} />
        </header>
        <ConstructorPaceEvolution races={trends.constructorPace} />
      </section>

      <section ref={teammateGapRef} style={{ ...sty.card, padding: "clamp(16px, 3vw, 24px)", marginTop: 12 }}>
        <header style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>
              Teammate gap trend
            </h2>
            <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0" }}>
              Per-team gap between teammates over the season. The dashed line is the flip boundary —
              crossing it means the slower driver became the faster one.
            </p>
          </div>
          <ShareButton domRef={teammateGapRef} meta={`${year} teammate gaps`} filename={`openf1ow-teammate-gap-${year}`} />
        </header>
        <TeammateGapEvolution races={trends.teammateGap} />
      </section>

      <section ref={tireDegRef} style={{ ...sty.card, padding: "clamp(16px, 3vw, 24px)", marginTop: 12 }}>
        <header style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>
              Tyre deg by compound
            </h2>
            <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0" }}>
              Median fuel-corrected degradation per compound, race by race. Lower = the compound
              held up better that weekend.
            </p>
          </div>
          <ShareButton domRef={tireDegRef} meta={`${year} tyre degradation`} filename={`openf1ow-tyre-deg-${year}`} />
        </header>
        <TireDegByCompound races={trends.tireDeg} />
      </section>

      <footer style={{
        marginTop: 24,
        fontSize: 11,
        color: C.textFaint,
        fontFamily: F,
        textAlign: "right",
      }}>
        artifact generated {new Date(trends.generatedAt).toLocaleString()}
      </footer>

      <div style={{ marginTop: 16, padding: "16px 0", borderTop: "1px solid " + C.border, fontSize: 13 }}>
        <a href={`/${year}`} style={{ color: C.textDim, textDecoration: "none", marginRight: 16 }}>← {year} season home</a>
        <a href="/insights" style={{ color: C.textDim, textDecoration: "none" }}>Race recaps</a>
      </div>

      <style>{`
        a:hover { color: ${C.text} !important; }
        a code { display: inline; }
      `}</style>
      <noscript />
      <ScreenReaderSummary trends={trends} year={year} />
    </div>
  );
}

// Hidden text fallback so assistive tech and crawlers still get the trend
// story without parsing the SVG.
function ScreenReaderSummary({ trends, year }: { trends: SeasonTrends; year: number }) {
  const last = trends.constructorPace[trends.constructorPace.length - 1];
  if (!last) return null;
  return (
    <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
      <p>
        {year} season constructor pace after {trends.raceCount} races.
        Fastest car at {last.meetingName}: {last.teams[0]?.team}, median pace {last.fastestTeamMedian.toFixed(3)} seconds.
        {last.teams.slice(1, 5).map(t => ` ${t.team} +${t.gapToFastest.toFixed(3)}s.`).join("")}
      </p>
    </div>
  );
}
