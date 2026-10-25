// How each team's pace at one weekend compares with its own season norm.
//
// Rows are teams, ordered by that weekend's gap to the fastest car. The hollow
// circle is the team's usual gap (median of the other rounds); the arrow runs
// from it to this weekend's gap, so an arrow pointing left means the team was
// closer to the front than usual. Gaps are percentages of the fastest team's
// lap time, which keeps rounds at different circuits comparable.

import { useMemo, useState } from "react";
import { TEAM_COLORS, TEAM_FALLBACK_COLORS } from "../../lib/constants";
import type { SeasonTrends } from "../../lib/seasonUtils";
import { F, M } from "../../lib/styles";

interface Props {
  trends: SeasonTrends;
}

type Metric = "race" | "quali";

interface Weekend { round: number; meetingName: string; gaps: Record<string, number> }

interface Row {
  team: string;
  now: number;      // % gap this weekend
  usual: number;    // median % gap over the other rounds
  delta: number;    // usual − now: positive = closer to the front than usual
}

/** Within this the arrow would be shorter than its own head — draw a dot. */
const DOT_THRESHOLD = 0.12;
/** A move this big gets a star. */
const STAR_THRESHOLD = 0.3;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weekends(trends: SeasonTrends, metric: Metric): Weekend[] {
  if (metric === "race") {
    return trends.constructorPace.map(r => ({
      round: r.round,
      meetingName: r.meetingName,
      gaps: Object.fromEntries(r.teams.map(t => [t.team, (t.gapToFastest / r.fastestTeamMedian) * 100])),
    }));
  }
  return (trends.constructorQualifying ?? []).map(r => ({
    round: r.round,
    meetingName: r.meetingName,
    gaps: Object.fromEntries(r.teams.map(t => [t.team, (t.gapToFastest / r.fastestTeamBest) * 100])),
  }));
}

export default function TeamFormVsSeason({ trends }: Props) {
  const [metric, setMetric] = useState<Metric>("race");
  const [picked, setPicked] = useState<number | null>(null);

  const hasQuali = (trends.constructorQualifying?.length ?? 0) > 1;
  const all = useMemo(
    () => weekends(trends, metric).sort((a, b) => a.round - b.round),
    [trends, metric],
  );
  const current = all.find(w => w.round === picked) ?? all[all.length - 1];

  const rows = useMemo<Row[]>(() => {
    if (!current) return [];
    const others = all.filter(w => w !== current);
    return Object.entries(current.gaps)
      .map(([team, now]) => {
        const history = others.map(w => w.gaps[team]).filter((v): v is number => v != null);
        if (!history.length) return null;
        const usual = median(history);
        return { team, now, usual, delta: usual - now };
      })
      .filter((r): r is Row => !!r)
      .sort((a, b) => a.now - b.now);
  }, [all, current]);

  if (!current || !rows.length) {
    return <div style={{ color: 'var(--text-mute)', fontSize: 12, padding: 12 }}>Needs at least two rounds.</div>;
  }

  const max = Math.max(0.5, ...rows.flatMap(r => [r.now, r.usual]));
  const x = (v: number) => (v / max) * 94 + 3; // % of the track, with a margin for the markers
  const stars = new Set(
    [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2)
      .filter(r => Math.abs(r.delta) >= STAR_THRESHOLD).map(r => r.team),
  );
  const colorOf = (team: string, i: number) => TEAM_COLORS[team] ?? TEAM_FALLBACK_COLORS[i % TEAM_FALLBACK_COLORS.length];

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {hasQuali && (
          <div role="tablist" aria-label="Session" style={{
            display: "inline-flex", background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)", borderRadius: 6, padding: 2, marginRight: 4,
          }}>
            {(["race", "quali"] as Metric[]).map(m => (
              <button
                key={m}
                role="tab"
                aria-selected={metric === m}
                onClick={() => setMetric(m)}
                style={{
                  background: metric === m ? "rgba(255,255,255,0.12)" : "transparent",
                  color: metric === m ? 'var(--text)' : 'var(--text-mute)',
                  border: "none", padding: "3px 10px", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: F,
                  cursor: "pointer", borderRadius: 4,
                }}
              >{m === "race" ? "Race" : "Quali"}</button>
            ))}
          </div>
        )}
        {all.map(w => (
          <button
            key={w.round}
            onClick={() => setPicked(w.round)}
            title={w.meetingName}
            style={chip(w.round === current.round)}
          >R{w.round}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.5 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{current.meetingName}</span>
        {" — "}{metric === "race" ? "race" : "qualifying"} gap to the fastest car, against each team's median over the
        other {all.length - 1} round{all.length === 2 ? "" : "s"}.
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "minmax(96px,150px) 1fr 76px 16px", gap: 12,
        padding: "0 10px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: 'var(--text-faint)',
      }}>
        <span />
        <span>◀ FASTER</span>
        <span style={{ textAlign: "right" }}>VS USUAL</span>
        <span />
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {rows.map((r, i) => {
          const color = colorOf(r.team, i);
          const dot = Math.abs(r.delta) < DOT_THRESHOLD;
          const faster = r.delta > 0;
          const from = x(r.usual), to = x(r.now);
          return (
            <div
              key={r.team}
              style={{
                display: "grid", gridTemplateColumns: "minmax(96px,150px) 1fr 76px 16px", gap: 12,
                alignItems: "center", padding: "8px 10px",
                background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
                borderRadius: 8, borderLeft: "3px solid " + color,
              }}
            >
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: 'var(--text)',
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{r.team}</div>

              <div
                style={{ position: "relative", height: 20 }}
                role="img"
                aria-label={`${r.team}: ${r.now.toFixed(2)}% off the fastest car, usually ${r.usual.toFixed(2)}%`}
              >
                {!dot && (
                  <>
                    <div style={{
                      position: "absolute", top: 8, height: 4, background: color, borderRadius: 2,
                      left: Math.min(from, to) + "%", width: Math.abs(from - to) + "%",
                    }} />
                    <div style={{
                      position: "absolute", top: 3, left: to + "%",
                      transform: faster ? "translateX(-1px)" : "translateX(-9px)",
                      width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent",
                      ...(faster ? { borderRight: "10px solid " + color } : { borderLeft: "10px solid " + color }),
                    }} />
                  </>
                )}
                {dot && (
                  <div style={{
                    position: "absolute", top: 3, left: to + "%", transform: "translateX(-7px)",
                    width: 14, height: 14, borderRadius: "50%", background: color,
                  }} />
                )}
                <div style={{
                  position: "absolute", top: 3, left: from + "%", transform: "translateX(-7px)",
                  width: 11, height: 11, borderRadius: "50%", border: "2px solid var(--text-dim)",
                  background: "transparent", boxSizing: "content-box",
                }} />
              </div>

              <div style={{
                fontFamily: M, fontSize: 12, fontWeight: 700, textAlign: "right",
                color: faster ? 'var(--pos)' : 'var(--neg, #f87171)',
              }}>
                {faster ? "▲" : "▼"} {Math.abs(r.delta).toFixed(2)}%
              </div>
              <div style={{ color: "#facc15", fontSize: 13, lineHeight: 1 }} aria-label={stars.has(r.team) ? "big mover" : undefined}>
                {stars.has(r.team) ? "★" : ""}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-mute)', margin: "14px 4px 0", lineHeight: 1.5 }}>
        Filled end = this weekend, hollow circle = the team's usual gap. ▲ green means closer to the front than usual,
        ▼ red means further back. Gaps are percentages of the fastest team's lap time, so a tenth at Monza and a tenth
        at Monaco weigh the same. ★ marks moves of {STAR_THRESHOLD}% or more. The reference car changes every weekend,
        so a team can also move because the leader did.
      </p>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--surface-hi)' : "transparent",
    color: active ? 'var(--text)' : 'var(--text-mute)',
    border: "1px solid " + (active ? 'var(--border-strong)' : 'var(--border)'),
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: F,
  };
}
