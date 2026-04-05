import { sty } from "../../lib/styles";
import { TC } from "../../lib/constants";

interface StintsTabProps {
  stints: any[];
  pits: any[];
}

export default function StintsTab({ stints, pits }: StintsTabProps) {
  return (
    <>
      <div style={sty.card}>
        <div style={{
          ...sty.sectionHead,
          marginBottom: 16,
        }}>Tyre Stints</div>
        {/* Horizontal timeline */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "8px 0" }}>
          {stints.map((s, si) => (
            <div key={s.stint_number} style={{ display: "flex", alignItems: "center" }}>
              {/* Stint node */}
              <div style={{
                background: "rgba(20,20,36,0.9)",
                borderRadius: 10,
                padding: "12px 18px",
                minWidth: 120,
                border: "1px solid rgba(255,255,255,0.06)",
                borderTop: "3px solid " + (TC[s.compound] || "#666"),
                position: "relative",
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: TC[s.compound] || "#e8e8ec",
                  fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                  marginBottom: 4,
                }}>{s.compound}</div>
                <div style={{
                  fontSize: 11,
                  color: "#b0b0c0",
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}>L{s.lap_start}{"\u2013"}{s.lap_end}</div>
                <div style={{
                  fontSize: 10,
                  color: "#5a5a6e",
                  marginTop: 2,
                }}>{s.lap_end - s.lap_start + 1} laps / Age {s.tyre_age_at_start}</div>
              </div>
              {/* Connector line */}
              {si < stints.length - 1 && (
                <div style={{
                  width: 32,
                  height: 2,
                  background: "rgba(255,255,255,0.08)",
                  flexShrink: 0,
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={sty.card}>
        <div style={{
          ...sty.sectionHead,
          marginBottom: 14,
        }}>Pit Stops</div>
        {!pits.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No pit stops</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Lap", "Lane", "Stop", "Time"].map((h, i) => <th key={i} style={{ ...sty.th, textAlign: i > 0 && i < 3 ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {pits.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ ...sty.td, fontWeight: 600 }}>{p.lap_number}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{p.lane_duration?.toFixed(3)}s</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", fontWeight: 700, color: "#fbbf24" }}>{p.stop_duration ? p.stop_duration + "s" : "\u2014"}</td>
                  <td style={{ ...sty.td, fontSize: 10, color: "#5a5a6e", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{(p.date || "").split("T")[1]?.substring(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
