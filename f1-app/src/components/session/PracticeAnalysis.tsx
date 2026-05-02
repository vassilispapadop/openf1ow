import { useEffect, useMemo, useState } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import { api } from "../../lib/api";
import { F, M, C, sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { TC } from "../../lib/constants";
import {
  bestLapsByDriver,
  longRunsByDriver,
  compoundProgramByDriver,
} from "../../lib/sessionAnalysis";
import Spinner from "../Spinner";

const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"];

export default function PracticeAnalysis({ sessionKey, drivers, sessionName }: {
  sessionKey: string;
  drivers: Driver[];
  sessionName?: string;
}) {
  const [laps, setLaps] = useState<Lap[]>([]);
  const [stints, setStints] = useState<Stint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      api(`/laps?session_key=${sessionKey}`),
      api(`/stints?session_key=${sessionKey}`).catch(() => []),
    ]).then(([l, s]) => {
      setLaps(l as Lap[]);
      setStints(s as Stint[]);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, [sessionKey]);

  const bests = useMemo(() => bestLapsByDriver(laps, drivers, stints), [laps, drivers, stints]);
  const longRuns = useMemo(() => longRunsByDriver(laps, drivers, stints, 6), [laps, drivers, stints]);
  const program = useMemo(() => compoundProgramByDriver(stints, drivers), [stints, drivers]);

  if (loading) return <Spinner label="Loading practice laps..." />;
  if (error) return <div style={sty.err}>{error}</div>;
  if (!bests.length) return <div style={{ ...sty.card, color: C.textMute, fontSize: 13 }}>No timed laps in this session yet.</div>;

  const fastest = bests[0];

  return (
    <div className="fade-in-up">
      <section style={{ ...sty.card, background: "rgba(255,255,255,0.02)" }}>
        <h3 style={sty.sectionHead}>{sessionName || "Practice"}</h3>
        <p style={{ fontSize: 12, color: C.textMute, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 760 }}>
          Practice mixes single-lap quali sims, race-pace runs, and tyre evaluation — so race-distance metrics are noise here.
          Below: each driver's best lap, any long-run race-pace samples (≥6 clean laps), and the compound program they ran.
        </p>
      </section>

      {/* Best laps */}
      <section style={sty.card}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={sty.sectionHead}>Best laps</h3>
          <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
            Personal bests with the tyre fitted on that lap. Don't read too much into FP1/FP2 P1 — fuel loads vary wildly.
          </p>
        </header>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["#", "Driver", "Team", "Best Lap", "Gap", "Tyre", "Top Speed", "Laps"].map((h, i) => (
                  <th key={i} style={{ ...sty.th, textAlign: i <= 2 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bests.map((r, i) => {
                const tColor = r.driver.team_colour || "666";
                return (
                  <tr key={r.driver.driver_number} style={rowBg(i)}>
                    <td style={{ ...sty.td, fontWeight: 800, fontSize: 14, color: podiumColor(i) }}>{i + 1}</td>
                    <td style={{ ...sty.td, borderLeft: "3px solid #" + tColor, paddingLeft: 12, fontWeight: 600 }}>
                      <span style={{ color: C.textMute, marginRight: 6, fontSize: 11 }}>#{r.driver.driver_number}</span>
                      {r.driver.full_name}
                    </td>
                    <td style={{ ...sty.td, color: "#" + tColor, fontSize: 11, fontWeight: 600 }}>{r.driver.team_name}</td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{ft3(r.bestLap)}</td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: i === 0 ? C.pos : C.textMute }}>
                      {fastest && i > 0 ? "+" + (r.bestLap - fastest.bestLap).toFixed(3) : "—"}
                    </td>
                    <td style={{ ...sty.td, textAlign: "right", color: r.compound ? (TC[r.compound] || C.textDim) : C.textFaint, fontWeight: 700, fontSize: 10, letterSpacing: "0.08em" }}>
                      {r.compound || "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textDim }}>
                      {r.st_speed != null ? r.st_speed.toFixed(0) + " km/h" : "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textMute }}>{r.lapsCompleted}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Long runs — only if any */}
      <section style={sty.card}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={sty.sectionHead}>Race-pace samples</h3>
          <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
            Stints with ≥6 consecutive clean laps. Median pace is the most reliable race-pace indicator from FP, but slope is raw —
            we don't know fuel load.
          </p>
        </header>
        {longRuns.length === 0 ? (
          <div style={{ color: C.textFaint, fontStyle: "italic", padding: "12px 0", fontSize: 12 }}>
            No long runs detected — drivers focused on single-lap pace this session.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Driver", "Team", "Compound", "Laps", "Stint", "Median", "Best", "Slope"].map((h, i) => (
                    <th key={i} style={{ ...sty.th, textAlign: i <= 2 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {longRuns.map((r, i) => {
                  const tColor = r.driver.team_colour || "666";
                  return (
                    <tr key={r.driver.driver_number + "-" + r.stintNumber} style={rowBg(i)}>
                      <td style={{ ...sty.td, borderLeft: "3px solid #" + tColor, paddingLeft: 12, fontWeight: 600 }}>
                        <span style={{ color: C.textMute, marginRight: 6, fontSize: 11 }}>#{r.driver.driver_number}</span>
                        {r.driver.full_name}
                      </td>
                      <td style={{ ...sty.td, color: "#" + tColor, fontSize: 11, fontWeight: 600 }}>{r.driver.team_name}</td>
                      <td style={{ ...sty.td, color: TC[r.compound] || C.textDim, fontWeight: 700, fontSize: 10, letterSpacing: "0.08em" }}>{r.compound}</td>
                      <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.text, fontWeight: 700 }}>{r.laps.length}</td>
                      <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textDim }}>L{r.startLap}-L{r.endLap}</td>
                      <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700 }}>{ft3(r.medianPace)}</td>
                      <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#a855f7" }}>{ft3(r.bestLap)}</td>
                      <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: r.slope > 0.05 ? C.warn : C.textDim }}>
                        +{r.slope.toFixed(3)}/lap
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Compound program */}
      <section style={sty.card}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={sty.sectionHead}>Compound program</h3>
          <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
            Laps each driver completed on each compound. Heavy hard-tyre running suggests a race-stint focus; mostly soft = quali-sim focus.
          </p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {program.map(p => {
            const tColor = p.driver.team_colour || "666";
            return (
              <div key={p.driver.driver_number} style={{
                padding: "12px 14px",
                background: C.surfaceAlt,
                border: "1px solid " + C.border,
                borderLeft: "3px solid #" + tColor,
                borderRadius: 8,
                fontFamily: F,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.driver.name_acronym}</span>
                    <span style={{ fontSize: 10, color: C.textMute, marginLeft: 6 }}>#{p.driver.driver_number}</span>
                  </div>
                  <span style={{ fontFamily: M, fontSize: 12, color: C.textDim }}>{p.totalLaps}L</span>
                </div>
                <div style={{ display: "flex", gap: 4, height: 8, borderRadius: 4, overflow: "hidden", background: C.surface }}>
                  {COMPOUND_ORDER.filter(c => p.byCompound[c]).map(c => (
                    <div key={c} style={{
                      flex: p.byCompound[c],
                      background: TC[c] || "#666",
                      minWidth: 2,
                    }} title={`${c}: ${p.byCompound[c]} laps`} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 10 }}>
                  {COMPOUND_ORDER.filter(c => p.byCompound[c]).map(c => (
                    <span key={c} style={{
                      color: TC[c] || C.textDim,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      fontFamily: M,
                    }}>
                      {c[0]}·{p.byCompound[c]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
