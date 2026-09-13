import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { F, C, sty } from "../lib/styles";
import { loadSeasonTrends } from "../lib/seasonClient";
import type { SeasonTrends } from "../lib/seasonUtils";
import CornerStraightBalance from "../components/season/CornerStraightBalance";
import SeasonTrendChart from "../components/season/SeasonTrendChart";
import Spinner from "../components/Spinner";
import { Section } from "../ui";

/** Section ids are evidence anchors (deep-linkable) — keep them stable. */
export const SEASON_SECTIONS = {
  constructorPace: "constructor-pace",
  constructorQualifying: "constructor-qualifying",
  teammateGap: "teammate-gap",
  cornerStraightEvolution: "corner-straight-evolution",
  cornerStraightBalance: "corner-straight-balance",
  tyreDeg: "tyre-deg",
  tyreLife: "tyre-life",
  conversion: "conversion",
} as const;

export default function SeasonTrendsPage() {
  const params = useParams<{ year?: string }>();
  const year = Number(params.year) || new Date().getFullYear();
  const [trends, setTrends] = useState<SeasonTrends | null | "missing">(null);

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

  const hasCorners = !!trends.cornerStraight && trends.cornerStraight.length > 0;

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
          {year} F1 — pace, gaps, corners, degradation
        </h1>
        <p style={{ fontSize: 14, color: C.textDim, margin: "8px 0 0", maxWidth: 720 }}>
          Cross-race trends derived from clean-lap medians and fuel-corrected stint deg.
          Lower gap = closer to the fastest car. Click a team in the legend to isolate it.
        </p>
      </header>

      <Section
        id={SEASON_SECTIONS.constructorPace}
        title="Constructor pace evolution"
        hint="Median lap-time gap to the fastest car, per race. Top 3 highlighted; hover the chart for the full ranking at any round."
        method={{
          summary: "Each driver's median fuel-corrected clean lap; a team's figure is the median of its drivers who covered at least 75 % of the race distance. Gap is to the fastest team that weekend.",
          steps: [
            "Clean laps exclude lap 1, pit in/out laps, safety-car, VSC and red-flag periods, laps under a sector yellow, laps after a retirement, and per-stint outliers (median + 3·MAD).",
            "Lap times are corrected to race-end fuel using the race's fitted s/kg (or 0.055 by default).",
          ],
          caveats: ["The reference is re-picked every race, so this is relative form, not absolute pace."],
          inputs: ["laps", "stints", "pit", "race_control", "session_result", "intervals", "position"],
        }}
        share={{ meta: `${year} constructor pace`, filename: `openf1ow-constructor-pace-${year}` }}
      >
        <SeasonTrendChart trends={trends} metric="race" />
      </Section>

      {trends.constructorQualifying && trends.constructorQualifying.length > 0 && (
        <Section
          id={SEASON_SECTIONS.constructorQualifying}
          title="Constructor qualifying evolution"
          hint="The faster of each team's drivers in qualifying becomes the constructor's lap. Same chart shape as the race-pace one, but on single-lap push pace — less polluted by race-day traffic and pit-stop variance."
          method={{
            summary: "A driver's best qualifying lap counts only with two or more push laps within 3 % of it; the team takes its quicker driver. Q1/Q2 cutoffs are the 15th- and 10th-best laps of the session.",
            caveats: ["Cutoffs approximate the elimination boundaries — they are not read from the official session phases."],
          }}
          share={{ meta: `${year} constructor qualifying`, filename: `openf1ow-constructor-qualifying-${year}` }}
        >
          <SeasonTrendChart trends={trends} metric="quali" />
        </Section>
      )}

      <Section
        id={SEASON_SECTIONS.teammateGap}
        title="Teammate gap trend"
        hint="Per-team gap between teammates over the season. The dashed line is the flip boundary — crossing it means the slower driver became the faster one."
        method={{
          summary: "Median difference on paired laps — the same lap number, both clean, both in the same traffic state (clear air or behind a car). Every driver on a team is considered; the pair with the most shared laps is shown.",
          steps: ["Significance: a bootstrap 95 % interval that excludes zero, with at least 10 paired laps."],
        }}
        share={{ meta: `${year} teammate gaps`, filename: `openf1ow-teammate-gap-${year}` }}
      >
        <SeasonTrendChart trends={trends} metric="teammate" />
      </Section>

      {hasCorners && (
        <Section
          id={SEASON_SECTIONS.cornerStraightEvolution}
          title="Corner, curve & straight evolution"
          hint="The same chart shape as constructor qualifying, but on one part of the lap at a time. Switch between corners, fast curves and straights to see which way a team's development went — the axis is signed, so a line can sit above the reference."
          share={{ meta: `${year} corner & straight evolution`, filename: `openf1ow-corner-straight-evolution-${year}` }}
        >
          <SeasonTrendChart trends={trends} metric="corners" />
        </Section>
      )}

      {hasCorners && (
        <Section
          id={SEASON_SECTIONS.cornerStraightBalance}
          title="Corners, curves & straights"
          hint="Which part of the lap each team's deficit comes from. The gaps are a decomposition of the same qualifying lap, so they sum to the team's lap-time gap — a car can be quicker through the corners and still lose the lap on the straights."
          share={{ meta: `${year} corners vs straights`, filename: `openf1ow-corners-straights-${year}` }}
        >
          <CornerStraightBalance races={trends.cornerStraight!} />
        </Section>
      )}

      <Section
        id={SEASON_SECTIONS.tyreDeg}
        title="Tyre deg by compound"
        hint="Median fuel-corrected degradation per compound, race by race. Lower = the compound held up better that weekend; negative means the tyre was still coming in."
        method={{
          summary: "Each stint's slope of fuel-corrected time against tyre age, on clean clear-air laps after the first two of the stint, with at least five laps. The compound's figure is the median across stints with a usable fit.",
          caveats: ["Slopes are not clamped at zero: a negative value is a tyre getting faster as it warmed or the track rubbered in."],
        }}
        share={{ meta: `${year} tyre degradation`, filename: `openf1ow-tyre-deg-${year}` }}
      >
        <SeasonTrendChart trends={trends} metric="tyre" />
      </Section>

      {trends.tyreLife && trends.tyreLife.length > 0 && (
        <Section
          id={SEASON_SECTIONS.tyreLife}
          title="Tyre life by compound"
          hint="How far each compound was pushed, race by race: the 90th-percentile stint length, and the tyre age at which the pooled degradation curve fell off a cliff when it did."
          method={{
            summary: "Per compound: residuals of fuel-corrected lap time against each stint's own intercept, binned by tyre age across every stint with a usable fit (≥ 3 stints per bin). Cliff = first bin whose median rises more than 0.3 s over the two before it. p90 stint length is over every stint on the compound.",
            caveats: ["Stint length is a strategic choice as much as a tyre property — a one-stop race stretches every compound."],
          }}
          share={{ meta: `${year} tyre life`, filename: `openf1ow-tyre-life-${year}` }}
        >
          <SeasonTrendChart trends={trends} metric="tyreLife" />
        </Section>
      )}

      {trends.conversion && trends.conversion.length > 0 && (
        <Section
          id={SEASON_SECTIONS.conversion}
          title="Grid → finish conversion"
          hint="Which teams turn Saturday into Sunday. Mean places gained from the grid to the flag by each team's classified drivers, every race."
          method={{
            summary: "Grid from the starting-grid feed (else the qualifying classification, else the position feed before the start); finish from the race classification. Retirements are left out, so a team that lost a car does not read as a gain for the other.",
          }}
          share={{ meta: `${year} grid to finish`, filename: `openf1ow-conversion-${year}` }}
        >
          <SeasonTrendChart trends={trends} metric="conversion" />
        </Section>
      )}

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
