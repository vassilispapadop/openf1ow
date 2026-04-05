import { sty } from "../../lib/styles";
import { ft } from "../../lib/format";

interface ResultsTabProps {
  results: any[];
  drivers: any[];
  dn: string;
}

export default function ResultsTab({ results, drivers, dn }: ResultsTabProps) {
  return (
    <div style={sty.card}>
      <div style={{
        ...sty.sectionHead,
        marginBottom: 14,
      }}>Results</div>
      {!results.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No results yet</div> : (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Pos", "Driver", "Time", "Gap", "Laps", "Status"].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: [0, 5].includes(i) ? "center" : i >= 2 && i <= 4 ? "right" : "left" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {[...results].sort((a, b) => a.position - b.position).map((r, ri) => {
                const dv = drivers.find(d => d.driver_number === r.driver_number);
                const posColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                return (
                  <tr key={r.driver_number} style={{
                    background: String(r.driver_number) === String(dn)
                      ? "rgba(225,6,0,0.08)"
                      : ri % 2 === 0
                        ? "transparent"
                        : "rgba(255,255,255,0.015)",
                  }}>
                    <td style={{
                      ...sty.td,
                      textAlign: "center",
                      fontWeight: 800,
                      fontSize: r.position <= 3 ? 18 : 14,
                      color: r.position <= 3 ? posColors[r.position - 1] : "#e8e8ec",
                      fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                    }}>{r.position}</td>
                    <td style={{
                      ...sty.td,
                      borderLeft: "3px solid #" + (dv ? dv.team_colour : "333"),
                      paddingLeft: 12,
                    }}>
                      <span style={{
                        color: "#" + (dv ? dv.team_colour : "e8e8ec"),
                        fontWeight: 600,
                        marginRight: 6,
                        fontSize: 11,
                      }}>#{r.driver_number}</span>
                      <span style={{ fontWeight: 500 }}>{dv ? dv.full_name : "Driver " + r.driver_number}</span>
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0", fontSize: 11 }}>
                      {Array.isArray(r.duration) ? r.duration.map(x => x ? ft(x) : "\u2014").join(" / ") : ft(r.duration)}
                    </td>
                    <td style={{
                      ...sty.td,
                      ...sty.mono,
                      textAlign: "right",
                      color: r.gap_to_leader === 0 ? "#5a5a6e" : "#ef4444",
                      fontSize: 11,
                    }}>
                      {r.gap_to_leader === 0 ? "\u2014" : typeof r.gap_to_leader === "string" ? r.gap_to_leader : "+" + r.gap_to_leader + "s"}
                    </td>
                    <td style={{ ...sty.td, textAlign: "right", color: "#b0b0c0" }}>{r.number_of_laps || ""}</td>
                    <td style={{ ...sty.td, textAlign: "center" }}>
                      {r.dnf ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "0.5px" }}>DNF</span>
                      ) : r.dns ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316", letterSpacing: "0.5px" }}>DNS</span>
                      ) : r.dsq ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "0.5px" }}>DSQ</span>
                      ) : (
                        <span style={{ fontSize: 10, color: "#22c55e" }}>{"\u2713"}</span>
                      )}
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
