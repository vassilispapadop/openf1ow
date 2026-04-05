import { sty } from "../../lib/styles";

interface PositionTabProps {
  positions: any[];
}

export default function PositionTab({ positions }: PositionTabProps) {
  return (
    <div style={sty.card}>
      <div style={{
        ...sty.sectionHead,
        marginBottom: 14,
      }}>Position Changes</div>
      {!positions.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No data</div> : (
        <div style={{ overflow: "auto", maxHeight: 500 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><th style={sty.th}>Time</th><th style={{ ...sty.th, textAlign: "center" }}>Position</th></tr></thead>
            <tbody>
              {positions.map((p, i) => {
                const prev = i > 0 ? positions[i - 1].position : p.position;
                const df = prev - p.position;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                    <td style={{
                      ...sty.td,
                      fontSize: 11,
                      color: "#5a5a6e",
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}>{(p.date || "").split("T")[1]?.substring(0, 8)}</td>
                    <td style={{ ...sty.td, textAlign: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>P{p.position}</span>
                      {df !== 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: df > 0 ? "#22c55e" : "#ef4444" }}>{df > 0 ? "\u25B2" + df : "\u25BC" + Math.abs(df)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
