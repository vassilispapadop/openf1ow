import { sty } from "../../lib/styles";
import { ft, fs } from "../../lib/format";

interface LapsTabProps {
  laps: any[];
  best: any;
  drv: any;
  comparisons: any[];
  dn: string;
  carData: any[];
  selLap: number | null;
  onLoadTel: (lap: any) => void;
  onAddComparison: (driverNumber: string, lap: any, driverInfo: any) => void;
}

export default function LapsTab({ laps, best, drv, comparisons, dn, carData, selLap, onLoadTel, onAddComparison }: LapsTabProps) {
  return (
    <div style={sty.card}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <span style={{
          ...sty.sectionHead,
        }}>Lap Times & Sectors</span>
        <span style={{
          fontSize: 10,
          color: "#5a5a6e",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
        }}>{laps.length} laps</span>
      </div>
      <div style={{ overflow: "auto", maxHeight: 500 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Lap", "Time", "S1", "S2", "S3", "I1", "I2", "ST", "Pit", ""].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : i >= 8 ? "center" : "right" }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {laps.map((l, li) => {
              const ib = best && l.lap_duration === best.lap_duration;
              const isCmp = comparisons.some(c => c.id === dn + "-" + l.lap_number);
              return (
                <tr key={l.lap_number} style={{
                  background: ib
                    ? "transparent"
                    : li % 2 === 0
                      ? "transparent"
                      : "rgba(255,255,255,0.015)",
                }}>
                  <td style={{
                    ...sty.td,
                    fontWeight: 600,
                    borderLeft: ib ? "4px solid #e10600" : "4px solid transparent",
                    paddingLeft: ib ? 6 : 10,
                  }}>{l.lap_number}</td>
                  <td style={{
                    ...sty.td,
                    ...sty.mono,
                    textAlign: "right",
                    fontWeight: 700,
                    color: ib ? "#a855f7" : "#e8e8ec",
                  }}>{ft(l.lap_duration)}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_1)}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_2)}</td>
                  <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{fs(l.duration_sector_3)}</td>
                  <td style={{ ...sty.td, textAlign: "right", color: "#7dd3fc", fontSize: 11 }}>{l.i1_speed || "\u2014"}</td>
                  <td style={{ ...sty.td, textAlign: "right", color: "#7dd3fc", fontSize: 11 }}>{l.i2_speed || "\u2014"}</td>
                  <td style={{ ...sty.td, textAlign: "right", color: "#fbbf24", fontSize: 11 }}>{l.st_speed || "\u2014"}</td>
                  <td style={{ ...sty.td, textAlign: "center" }}>
                    {l.is_pit_out_lap ? (
                      <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#f97316",
                      }} />
                    ) : ""}
                  </td>
                  <td style={{ ...sty.td, textAlign: "center" }}>
                    {l.date_start && l.lap_duration ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        <button onClick={() => onLoadTel(l)} style={{
                          background: selLap === l.lap_number ? "#e10600" : "transparent",
                          color: selLap === l.lap_number ? "#fff" : "#6a6a7e",
                          border: selLap === l.lap_number ? "1px solid #e10600" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          transition: "all 0.2s ease",
                          fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                        }}>
                          {selLap === l.lap_number ? "\u2713" : "Load"}
                        </button>
                        <button
                          onClick={() => onAddComparison(dn, l, drv)}
                          disabled={isCmp}
                          style={{
                            background: isCmp ? "rgba(225,6,0,0.15)" : "transparent",
                            color: isCmp ? "#e10600" : "#5a5a6e",
                            border: isCmp ? "1px solid rgba(225,6,0,0.3)" : "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 6,
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 700,
                            transition: "all 0.2s ease",
                            fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                          }}
                        >
                          {isCmp ? "\u2713" : "+"}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
