// Where each team finds its lap time: cornering vs straight-line running.
//
// Every weekend, each team's fastest qualifying lap is split into corner and
// straight sections and timed against the fastest team's lap. Because the two
// gaps are a decomposition of the same lap time rather than two separate
// indices, cornerGap + straightGap is exactly the team's deficit — so a team
// can be genuinely quicker than the reference through the corners while still
// losing the lap, and the chart shows both halves of that at once.
//
// Rows are teams, sorted by total deficit. Two bars per row grow left (faster
// than the reference) or right (slower) from a shared centre line.

import { useMemo, useState } from "react";
import { F, M, C } from "../../lib/styles";
import { TEAM_COLORS, TEAM_FALLBACK_COLORS } from "../../lib/constants";
import type { CornerStraightRace } from "../../lib/seasonUtils";

interface Props {
  races: CornerStraightRace[];
}

/** Seconds, or the gap as a share of the reference car's time through that
 *  part of the lap — the cross-circuit read, since corner time varies far more
 *  between tracks than straight time does. */
type Unit = "s" | "%";

interface Row {
  team: string;
  cornerGap: number;      // median across races
  straightGap: number;
  totalGap: number;
  races: number;
  bestAt: string | null;  // weekend where the team's corner advantage peaked
}

/** The reference car's own corner and straight times for a race. */
function refTimesFor(r: CornerStraightRace): { corner: number; straight: number } {
  const ref = r.teams.find(t => t.team === r.referenceTeam)
    ?? r.teams.reduce((m, t) => (t.gapToFastest < m.gapToFastest ? t : m), r.teams[0]);
  return { corner: ref?.cornerTime ?? 0, straight: ref?.straightTime ?? 0 };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const sd = (v: number, dp = 2) =>
  (Math.abs(v) < 5e-3 ? "" : v > 0 ? "+" : "−") + Math.abs(v).toFixed(dp);

/** Gap as a share of the reference car's time over the same stretch. */
function pct(gap: number, base: number): number {
  return base > 0 ? (gap / base) * 100 : 0;
}

export default function CornerStraightBalance({ races }: Props) {
  const [round, setRound] = useState<number | "season">("season");
  const [unit, setUnit] = useState<Unit>("s");

  const ordered = useMemo(() => [...races].sort((a, b) => a.round - b.round), [races]);

  const rows = useMemo<Row[]>(() => {
    if (round !== "season") {
      const r = ordered.find(x => x.round === round);
      if (!r) return [];
      const ref = refTimesFor(r);
      const lapBase = ref.corner + ref.straight;
      return r.teams.map(t => ({
        team: t.team,
        cornerGap: unit === "s" ? t.cornerGap : pct(t.cornerGap, ref.corner),
        straightGap: unit === "s" ? t.straightGap : pct(t.straightGap, ref.straight),
        totalGap: unit === "s" ? t.gapToFastest : pct(t.gapToFastest, lapBase),
        races: 1,
        bestAt: null,
      })).sort((a, b) => a.totalGap - b.totalGap);
    }

    // Season view: median per team, so one compromised weekend (traffic, a
    // yellow, a wet Q3) doesn't decide a team's character.
    const byTeam: Record<string, { corner: number[]; straight: number[]; total: number[]; best: { gap: number; at: string } | null }> = {};
    for (const r of ordered) {
      const ref = refTimesFor(r);
      const lapBase = ref.corner + ref.straight;
      for (const t of r.teams) {
        const e = (byTeam[t.team] ||= { corner: [], straight: [], total: [], best: null });
        // Percentages are taken per race and then medianed, not the other way
        // round — each weekend gets normalised against its own circuit first.
        e.corner.push(unit === "s" ? t.cornerGap : pct(t.cornerGap, ref.corner));
        e.straight.push(unit === "s" ? t.straightGap : pct(t.straightGap, ref.straight));
        e.total.push(unit === "s" ? t.gapToFastest : pct(t.gapToFastest, lapBase));
        if (!e.best || t.cornerGap < e.best.gap) e.best = { gap: t.cornerGap, at: r.meetingName };
      }
    }
    return Object.entries(byTeam)
      .map(([team, e]) => ({
        team,
        cornerGap: median(e.corner),
        straightGap: median(e.straight),
        totalGap: median(e.total),
        races: e.total.length,
        bestAt: e.best?.at ?? null,
      }))
      .sort((a, b) => a.totalGap - b.totalGap);
  }, [ordered, round, unit]);

  const selected = round === "season" ? null : ordered.find(r => r.round === round) ?? null;

  const scale = useMemo(
    () => Math.max(unit === "s" ? 0.15 : 0.3, ...rows.flatMap(r => [Math.abs(r.cornerGap), Math.abs(r.straightGap)])),
    [rows, unit],
  );

  if (!races.length || !rows.length) {
    return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>No corner/straight data yet.</div>;
  }

  const colorOf = (team: string, i: number) => TEAM_COLORS[team] ?? TEAM_FALLBACK_COLORS[i % TEAM_FALLBACK_COLORS.length];

  const suffix = unit === "s" ? "s" : "%";
  const val = (v: number, dp = 2) => { const t = sd(v, dp); return t ? t + suffix : "—"; };

  const bar = (v: number, color: string) => {
    const pct = Math.min(100, (Math.abs(v) / scale) * 100);
    return (
      <div style={{ display: "flex", height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          {v < 0 && <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "5px 0 0 5px" }} />}
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
        <div style={{ flex: 1, display: "flex" }}>
          {v > 0 && <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "0 5px 5px 0" }} />}
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: F }}>
      {/* Round picker — the season median, or any single weekend — plus the unit */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div role="tablist" aria-label="Gap unit" style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid " + C.border,
          borderRadius: 6,
          padding: 2,
          marginRight: 4,
        }}>
          {(["s", "%"] as Unit[]).map(u => (
            <button
              key={u}
              role="tab"
              aria-selected={unit === u}
              onClick={() => setUnit(u)}
              style={{
                background: unit === u ? "rgba(255,255,255,0.12)" : "transparent",
                color: unit === u ? C.text : C.textMute,
                border: "none",
                padding: "3px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: F,
                cursor: "pointer",
                borderRadius: 4,
                minWidth: 32,
              }}
            >{u === "s" ? "Sec" : "%"}</button>
          ))}
        </div>
        <button
          onClick={() => setRound("season")}
          style={chip(round === "season")}
        >Season median</button>
        {ordered.map(r => (
          <button
            key={r.round}
            onClick={() => setRound(r.round)}
            title={r.meetingName}
            style={chip(round === r.round)}
          >R{r.round}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 12, lineHeight: 1.5 }}>
        {selected ? (
          <>
            <span style={{ color: C.text, fontWeight: 600 }}>{selected.meetingName}</span>
            {" — "}{selected.cornerCount} corner sections ({selected.cornerDistance.toLocaleString()} m)
            {" · "}{selected.straightCount} straights ({selected.straightDistance.toLocaleString()} m)
            {" · "}reference <span style={{ color: C.text, fontWeight: 600 }}>{selected.referenceTeam}</span>
          </>
        ) : (
          <>Median across {ordered.length} qualifying sessions. Each weekend is measured against
            that weekend's fastest team, so this is relative form, not absolute pace.</>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 10, color: C.textDim }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 6, borderRadius: 3, background: C.warn }} /> Corners
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 6, borderRadius: 3, background: C.violet }} /> Straights
        </span>
        <span style={{ color: C.textFaint }}>left of the line = faster than the reference</span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r, i) => (
          <div
            key={r.team}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(120px,160px) 1fr minmax(64px,80px)",
              gap: 12,
              alignItems: "center",
              padding: "8px 10px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              borderRadius: 8,
              borderLeft: "3px solid " + colorOf(r.team, i),
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{r.team}</div>
              <div style={{ fontSize: 10, color: C.textFaint }}>
                {round === "season" ? `${r.races} weekend${r.races === 1 ? "" : "s"}` : "qualifying"}
              </div>
            </div>

            <div style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, width: 58, textAlign: "right", color: gapColor(r.cornerGap) }}>
                  {val(r.cornerGap)}
                </span>
                <span style={{ flex: 1 }}>{bar(r.cornerGap, C.warn)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, width: 58, textAlign: "right", color: gapColor(r.straightGap) }}>
                  {val(r.straightGap)}
                </span>
                <span style={{ flex: 1 }}>{bar(r.straightGap, C.violet)}</span>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: gapColor(r.totalGap) }}>
                {sd(r.totalGap, unit === "s" ? 3 : 2) || (unit === "s" ? "0.000" : "0.00")}{suffix}
              </div>
              <div style={{ fontSize: 9.5, color: C.textFaint }}>lap gap</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: C.textMute, margin: "14px 4px 0", lineHeight: 1.5 }}>
        Built from qualifying telemetry: each team's fastest clean lap is cut into corner and straight
        sections at the same track positions for the whole field, so the two gaps sum exactly to the
        team's lap-time deficit. A team can read negative through the corners and still lose the lap —
        that's a car trading downforce for straight-line speed, or the reverse. Section boundaries adapt
        to the whole grid (earliest braking to the point every car is back on power), so the corner share
        of a lap runs wider here than in a two-car comparison. Switch to <strong>%</strong> to read each gap
        as a share of the reference car's time over that stretch, which is the fairer comparison across
        circuits — corner time swings far more track to track than straight time does.
      </p>
    </div>
  );
}

const mono = { fontFamily: M, fontSize: 11 };

function gapColor(v: number): string {
  if (Math.abs(v) < 5e-3) return C.textMute;
  return v < 0 ? C.pos : C.textDim;
}

function chip(active: boolean): React.CSSProperties {
  return {
    background: active ? C.surfaceHi : "transparent",
    color: active ? C.text : C.textMute,
    border: "1px solid " + (active ? C.borderStrong : C.border),
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: F,
  };
}
