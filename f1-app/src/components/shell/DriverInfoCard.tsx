import { F, M, sty } from "../../lib/styles";
import { ft } from "../../lib/format";

interface DriverInfoCardProps {
  drv: any;
  best: any;
  laps: number;
  pits: number;
  onLoadBest?: () => void;
  onAddBest?: () => void;
}

export default function DriverInfoCard({ drv, best, laps, pits, onLoadBest, onAddBest }: DriverInfoCardProps) {
  return (
    <div className="fade-in-up" style={{
      ...sty.card,
      borderTop: "3px solid #" + drv.team_colour,
      background: `linear-gradient(135deg, rgba(18,18,30,0.85) 0%, rgba(18,18,30,0.7) 100%)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        {/* Left: headshot + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {drv.headshot_url && (
            <img src={drv.headshot_url} alt="" style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "3px solid #" + drv.team_colour,
              boxShadow: `0 0 20px ${"#" + drv.team_colour}33, 0 0 40px rgba(0,0,0,0.4)`,
            }} />
          )}
          <div>
            <div style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: F,
              lineHeight: 1.2,
            }}>
              <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 500, marginRight: 6, fontSize: 16 }}>#{drv.driver_number}</span>
              {drv.full_name}
            </div>
            <div style={{
              color: "#" + drv.team_colour,
              fontSize: 11,
              fontWeight: 600,
              marginTop: 4,
              letterSpacing: "1px",
              textTransform: "uppercase" as const,
            }}>{drv.team_name}</div>
          </div>
        </div>

        {/* Right: stats row */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 0, alignItems: "center" }}>
          {best && (
            <div style={{
              textAlign: "center",
              padding: "0 24px",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#5a5a6e",
                textTransform: "uppercase" as const,
                letterSpacing: "0.5px",
                marginBottom: 4,
              }}>BEST LAP</div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#a855f7",
                fontFamily: M,
              }}>{ft(best.lap_duration)}</div>
              <div style={{
                fontSize: 10,
                color: "#5a5a6e",
                marginTop: 2,
              }}>Lap {best.lap_number}</div>
            </div>
          )}
          {/* Quick actions for best lap */}
          {best && (onLoadBest || onAddBest) && (
            <div style={{
              display: "flex",
              gap: 6,
              padding: "0 16px",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}>
              {onLoadBest && (
                <button onClick={onLoadBest} title="Load best lap telemetry" style={btnStyle}>
                  Load
                </button>
              )}
              {onAddBest && (
                <button onClick={onAddBest} title="Add best lap to comparison" style={btnStyle}>
                  +
                </button>
              )}
            </div>
          )}
          <div style={{
            textAlign: "center",
            padding: "0 24px",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#5a5a6e",
              textTransform: "uppercase" as const,
              letterSpacing: "0.5px",
              marginBottom: 4,
            }}>LAPS</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: M,
            }}>{laps}</div>
          </div>
          <div style={{ textAlign: "center", padding: "0 24px" }}>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#5a5a6e",
              textTransform: "uppercase" as const,
              letterSpacing: "0.5px",
              marginBottom: 4,
            }}>PITS</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: M,
            }}>{pits}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 10,
  fontWeight: 700,
  fontFamily: F,
  color: "#a855f7",
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
