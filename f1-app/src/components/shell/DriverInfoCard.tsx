import { F, M, C, sty } from "../../lib/styles";
import { ft } from "../../lib/format";

interface DriverInfoCardProps {
  drv: any;
  best: any;
  laps: number;
  pits: number;
  /** Counts render as em dashes rather than a misleading 0 while data is in flight. */
  loading?: boolean;
  onLoadBest?: () => void;
  onAddBest?: () => void;
}

export default function DriverInfoCard({ drv, best, laps, pits, loading, onLoadBest, onAddBest }: DriverInfoCardProps) {
  const team = "#" + drv.team_colour;

  return (
    <div className="fade-in-up" style={{
      ...sty.card,
      padding: 20,
      borderLeft: `3px solid ${team}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {drv.headshot_url ? (
            <img src={drv.headshot_url} alt="" style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              boxShadow: `inset 0 0 0 2px ${team}`,
            }} />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `${team}24`, color: team,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, fontFamily: M,
            }}>{drv.driver_number}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: F,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: C.text,
            }}>
              <span style={{ color: C.textMute, fontWeight: 500, marginRight: 8 }}>#{drv.driver_number}</span>
              {drv.full_name}
            </div>
            <div style={{
              color: team,
              fontSize: 12,
              fontWeight: 600,
              marginTop: 3,
            }}>{drv.team_name}</div>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 24, alignItems: "center" }}>
          {best && (
            <Stat label="Best lap" value={ft(best.lap_duration)} sub={`Lap ${best.lap_number}`} valueColor={C.violet} />
          )}
          {best && (onLoadBest || onAddBest) && (
            <div style={{ display: "flex", gap: 6 }}>
              {onLoadBest && <GhostBtn onClick={onLoadBest} title="Load best lap telemetry">Load</GhostBtn>}
              {onAddBest && <GhostBtn onClick={onAddBest} title="Add best lap to comparison">+</GhostBtn>}
            </div>
          )}
          <Stat label="Laps" value={loading ? "—" : String(laps)} />
          <Stat label="Pits" value={loading ? "—" : String(pits)} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: C.textMute, fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        fontFamily: M,
        color: valueColor || C.text,
        letterSpacing: "-0.01em",
      }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textMute, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GhostBtn({ children, onClick, title }: {
  children: React.ReactNode; onClick: () => void; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: C.surfaceAlt,
        border: "1px solid " + C.border,
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: F,
        color: C.text,
        cursor: "pointer",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderStrong; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
    >
      {children}
    </button>
  );
}
