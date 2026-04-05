import { F, M } from "../../lib/styles";

interface HeaderProps {
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
}

export default function Header({ meetings, mk, sessions, sk }: HeaderProps) {
  return (
    <div style={{
      position: "sticky" as const, top: 0, zIndex: 100,
    }}>
      {/* Racing stripe accent line */}
      <div style={{
        height: 2,
        background: "linear-gradient(90deg, transparent, #e10600 20%, #e10600 80%, transparent)",
        boxShadow: "0 0 12px rgba(225,6,0,0.4), 0 0 30px rgba(225,6,0,0.15)",
      }} />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        background: "rgba(5,5,8,0.9)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#e8e8ec", letterSpacing: "-0.5px", fontFamily: F }}>Open</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#e10600", letterSpacing: "-0.5px", fontFamily: F, textShadow: "0 0 24px rgba(225,6,0,0.4)" }}>F1</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#e8e8ec", letterSpacing: "-0.5px", fontFamily: F }}>ow</span>
          </div>
          {mk && meetings.length > 0 && (
            <div className="fade-in hide-mobile" style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 14px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#b0b0c0", fontFamily: F }}>
                {meetings.find(m => String(m.meeting_key) === mk)?.location || ""}
              </span>
              {sk && sessions.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#e10600", fontFamily: M }}>
                  {sessions.find(s => String(s.session_key) === sk)?.session_name || ""}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e10600", animation: "livePulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "1.5px", fontFamily: M, textTransform: "uppercase" as const }}>LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
