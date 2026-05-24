import { useEffect, useMemo, useState } from "react";
import type { Driver, Lap, Stint } from "../../lib/types";
import { api } from "../../lib/api";
import { F, M, C, sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { TC } from "../../lib/constants";
import { bestLapsByDriver } from "../../lib/sessionAnalysis";
import Spinner from "../Spinner";
import TrackMap from "./TrackMap";
import CornerAnalysis from "./CornerAnalysis";

export default function QualifyingAnalysis({ sessionKey, drivers, sessionName }: {
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

  const rows = useMemo(
    () => bestLapsByDriver(laps, drivers, stints),
    [laps, drivers, stints],
  );

  const pole = rows[0];
  const bestS1 = rows.reduce((m, r) => (r.s1 != null && (m == null || r.s1 < m) ? r.s1 : m), null as number | null);
  const bestS2 = rows.reduce((m, r) => (r.s2 != null && (m == null || r.s2 < m) ? r.s2 : m), null as number | null);
  const bestS3 = rows.reduce((m, r) => (r.s3 != null && (m == null || r.s3 < m) ? r.s3 : m), null as number | null);

  if (loading) return <Spinner label="Loading qualifying laps..." />;
  if (error) return <div style={sty.err}>{error}</div>;
  if (!rows.length) return <div style={{ ...sty.card, color: C.textMute, fontSize: 13 }}>No timed laps in this session yet.</div>;

  // Top 10 will start the race on whatever tyre they qualified on (Q3
  // compound). For Sprint Qualifying / Sprint Shootout this is the
  // grid for the sprint race.
  const top10 = rows.slice(0, 10);

  return (
    <div className="fade-in-up">
      {/* Session-type banner — explains the metrics */}
      <section style={{ ...sty.card, background: "rgba(255,255,255,0.02)" }}>
        <h3 style={sty.sectionHead}>{sessionName || "Qualifying"}</h3>
        <p style={{ fontSize: 12, color: C.textMute, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 760 }}>
          Single-lap pace, not race pace. Each driver's best clean lap, sector breakdown, and the tyre
          they set it on. The top-10 compound is the rubber they'll start the race on
          {sessionName?.toLowerCase().includes("sprint") ? " (sprint race)" : ""} —
          a major strategy signal.
        </p>
      </section>

      {/* Pole highlight */}
      {pole && (
        <section style={{
          ...sty.card,
          background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceAlt} 100%)`,
          borderColor: `#${pole.driver.team_colour || "888"}33`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `#${pole.driver.team_colour || "888"}22`,
              border: `2px solid #${pole.driver.team_colour || "888"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: M, fontWeight: 800, fontSize: 18,
              color: `#${pole.driver.team_colour || "888"}`,
            }}>{pole.driver.driver_number}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: C.textMute, fontWeight: 600, letterSpacing: "0.12em" }}>POLE</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.1, marginTop: 4 }}>
                {pole.driver.full_name}
              </div>
              <div style={{ fontSize: 13, color: C.textDim, marginTop: 2 }}>{pole.driver.team_name}</div>
            </div>
            <div style={{ textAlign: "right", fontFamily: M }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {ft3(pole.bestLap)}
              </div>
              {pole.compound && (
                <div style={{ fontSize: 11, color: TC[pole.compound] || C.textMute, fontWeight: 700, letterSpacing: "0.08em", marginTop: 4 }}>
                  ON {pole.compound}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Track map — pole sitter's fastest lap, coloured by speed */}
      {pole && pole.bestLapDateStart && (
        <section style={sty.card}>
          <header style={{ marginBottom: 14 }}>
            <h3 style={sty.sectionHead}>Pole lap — speed trace</h3>
            <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
              {pole.driver.full_name}'s fastest lap, drawn around the circuit. Blue = slow corners, red = top-end straights.
            </p>
          </header>
          <TrackMap
            sessionKey={sessionKey}
            driverNumber={pole.driver.driver_number}
            driverColor={pole.driver.team_colour}
            lap={{
              date_start: pole.bestLapDateStart,
              lap_duration: pole.bestLap,
              lap_number: pole.bestLapNumber,
            }}
            label={`${pole.driver.name_acronym} · L${pole.bestLapNumber}`}
            height={420}
          />
        </section>
      )}

      {/* Corner-by-corner profile of the pole lap */}
      {pole && pole.bestLapDateStart && (
        <section style={sty.card}>
          <header style={{ marginBottom: 14 }}>
            <h3 style={sty.sectionHead}>Corner-by-corner — pole lap</h3>
            <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
              Apex speed, braking duration, and time-to-full-throttle for each corner of {pole.driver.full_name}'s pole lap.
            </p>
          </header>
          <CornerAnalysis
            sessionKey={sessionKey}
            driverNumber={pole.driver.driver_number}
            lap={{
              date_start: pole.bestLapDateStart,
              lap_duration: pole.bestLap,
              lap_number: pole.bestLapNumber,
            }}
          />
        </section>
      )}

      {/* Leaderboard */}
      <section style={sty.card}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={sty.sectionHead}>Best laps</h3>
          <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
            Personal bests with sector breakdown. <span style={{ color: "#a855f7" }}>Purple</span> sectors are the session's overall best.
          </p>
        </header>

        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["#", "Driver", "Team", "Best Lap", "Gap", "Gap %", "S1", "S2", "S3", "Tyre", "Top Speed", "Laps"].map((h, i) => (
                  <th key={i} style={{ ...sty.th, textAlign: i <= 2 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const tColor = r.driver.team_colour || "666";
                const isPurpleS1 = bestS1 != null && r.s1 === bestS1;
                const isPurpleS2 = bestS2 != null && r.s2 === bestS2;
                const isPurpleS3 = bestS3 != null && r.s3 === bestS3;
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
                      {pole && i > 0 ? "+" + (r.bestLap - pole.bestLap).toFixed(3) : "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: i === 0 ? C.pos : C.textMute }}>
                      {pole && i > 0 ? "+" + (((r.bestLap - pole.bestLap) / pole.bestLap) * 100).toFixed(2) + "%" : "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: isPurpleS1 ? "#a855f7" : C.textDim, fontWeight: isPurpleS1 ? 700 : 400 }}>
                      {r.s1 != null ? r.s1.toFixed(3) : "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: isPurpleS2 ? "#a855f7" : C.textDim, fontWeight: isPurpleS2 ? 700 : 400 }}>
                      {r.s2 != null ? r.s2.toFixed(3) : "—"}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: isPurpleS3 ? "#a855f7" : C.textDim, fontWeight: isPurpleS3 ? 700 : 400 }}>
                      {r.s3 != null ? r.s3.toFixed(3) : "—"}
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

      {/* Race start tyre projection — top 10 */}
      <section style={sty.card}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={sty.sectionHead}>Race start tyre — top 10</h3>
          <p style={{ fontSize: 12, color: C.textMute, margin: "4px 0 0", lineHeight: 1.5 }}>
            Drivers in the top 10 must start on the tyre they set their best lap on. Different compounds in the points = different strategies on lap 1.
          </p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {top10.map((r, i) => (
            <div key={r.driver.driver_number} style={{
              padding: "10px 12px",
              background: C.surfaceAlt,
              border: "1px solid " + C.border,
              borderLeft: "3px solid #" + (r.driver.team_colour || "666"),
              borderRadius: 8,
              fontFamily: F,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: podiumColor(i) }}>P{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.driver.name_acronym}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textMute, marginTop: 4 }}>{r.driver.team_name}</div>
              <div style={{
                fontSize: 11,
                color: r.compound ? (TC[r.compound] || C.textDim) : C.textFaint,
                fontWeight: 800,
                letterSpacing: "0.08em",
                marginTop: 6,
              }}>
                {r.compound || "—"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
