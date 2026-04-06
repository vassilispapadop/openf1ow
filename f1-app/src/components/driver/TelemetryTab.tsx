import { useMemo } from "react";
import { sty } from "../../lib/styles";
import { DRS_OPEN, DRS_ELIGIBLE } from "../../lib/constants";
import { Chart } from "../TelemetryChart";
import { detectClipping } from "../../lib/clipping";

interface TelemetryTabProps {
  carData: any[];
  selLap: number | null;
  dn: string;
  drv: any;
}

export default function TelemetryTab({ carData, selLap, dn, drv }: TelemetryTabProps) {
  const clipEvents = useMemo(() => carData.length ? detectClipping(carData) : [], [carData]);

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
        }}>{carData.length ? "Lap " + selLap + " Telemetry" : "Car Telemetry"}</span>
        {carData.length > 0 && (
          <span style={{
            fontSize: 10,
            color: "#5a5a6e",
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}>{carData.length} samples</span>
        )}
      </div>
      {!carData.length ? (
        <div style={{ textAlign: "center", padding: 40, color: "#5a5a6e" }}>
          <p style={{ fontSize: 13, fontWeight: 500 }}>Go to <b style={{ color: "#e8e8ec" }}>Laps & Sectors</b> and click <b style={{ color: "#e8e8ec" }}>Load</b> on any lap.</p>
          <p style={{ fontSize: 11, marginTop: 8, color: "#444" }}>Shows speed, throttle, brake, gear, RPM, DRS at ~3.7Hz</p>
        </div>
      ) : (
        <>
          <Chart traces={[{ data: carData, color: drv.team_colour || "3b82f6", label: "#" + dn + " Lap " + selLap }]} clippingEvents={clipEvents} />
          <div style={{ overflow: "auto", maxHeight: 400, marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{["Dist", "Time", "Speed", "Throttle", "Brake", "Gear", "RPM", "DRS"].map((h, i) => (
                  <th key={i} style={{ ...sty.th, textAlign: [1].includes(i) ? "left" : [4, 7].includes(i) ? "center" : "right" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {carData.map((c, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <td style={{
                      ...sty.td,
                      ...sty.mono,
                      textAlign: "right",
                      color: "#5a5a6e",
                      fontSize: 10,
                    }}>{Math.round(c.distance || 0).toLocaleString()}</td>
                    <td style={{
                      ...sty.td,
                      fontSize: 10,
                      color: "#444",
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}>{(c.date || "").split("T")[1]?.substring(0, 12)}</td>
                    <td style={{
                      ...sty.td,
                      ...sty.mono,
                      textAlign: "right",
                      fontWeight: 700,
                      color: "#fff",
                    }}>{c.speed}</td>
                    <td style={{ ...sty.td, textAlign: "right" }}>
                      <span style={{ ...sty.mono, fontSize: 11, color: "#b0b0c0" }}>{c.throttle}%</span>
                      <div style={{
                        height: 5,
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 3,
                        marginTop: 2,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: 5,
                          background: "#" + (drv.team_colour || "22c55e"),
                          borderRadius: 3,
                          width: c.throttle + "%",
                          transition: "width 0.1s ease",
                        }} />
                      </div>
                    </td>
                    <td style={{ ...sty.td, textAlign: "center" }}>
                      {c.brake ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#ef4444",
                          fontFamily: "'JetBrains Mono','SF Mono',monospace",
                          letterSpacing: "0.5px",
                        }}>BRK</span>
                      ) : (
                        <span style={{ color: "#2a2a3a" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#b0b0c0" }}>{c.n_gear}</td>
                    <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: "#5a5a6e", fontSize: 11 }}>{c.rpm}</td>
                    <td style={{ ...sty.td, textAlign: "center" }}>
                      {DRS_OPEN.includes(c.drs) ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#22c55e",
                          fontFamily: "'JetBrains Mono','SF Mono',monospace",
                        }}>OPEN</span>
                      ) : c.drs === DRS_ELIGIBLE ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "#eab308",
                          fontFamily: "'JetBrains Mono','SF Mono',monospace",
                        }}>ELIG</span>
                      ) : (
                        <span style={{ color: "#2a2a3a" }}>{"\u2014"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
