import { sty } from "../../lib/styles";

interface SelectorBarProps {
  year: number;
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
  drivers: any[];
  dn: string;
  onYear: (y: number) => void;
  onMeeting: (v: string) => void;
  onSession: (v: string) => void;
  onDriver: (v: string) => void;
}

export default function SelectorBar({ year, meetings, mk, sessions, sk, drivers, dn, onYear, onMeeting, onSession, onDriver }: SelectorBarProps) {
  return (
    <div className="fade-in-up card-glow" style={{
      ...sty.card,
      display: "flex",
      alignItems: "flex-end",
      gap: 0,
      padding: 0,
      overflow: "hidden",
      borderTop: "1px solid rgba(225,6,0,0.08)",
    }}>
      {/* Year */}
      <div style={{ flex: 0.4, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{
          fontSize: 9, fontWeight: 600, color: "#5a5a6e",
          textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
        }}>SEASON</div>
        <select
          style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }}
          value={year}
          onChange={e => onYear(Number(e.target.value))}
        >
          {[2026, 2025, 2024, 2023].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {/* Race */}
      <div style={{ flex: 1, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{
          fontSize: 9, fontWeight: 600, color: "#5a5a6e",
          textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
        }}>RACE</div>
        <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={mk} onChange={e => onMeeting(e.target.value)}>
          <option value="">Select Race ({meetings.length})</option>
          {meetings.map(m => <option key={m.meeting_key} value={m.meeting_key}>{m.country_name} {"\u2014"} {m.meeting_name}</option>)}
        </select>
      </div>
      {/* Session */}
      {sessions.length > 0 && (
        <div className="fade-in" style={{ flex: 0.6, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{
            fontSize: 9, fontWeight: 600, color: "#5a5a6e",
            textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
          }}>SESSION</div>
          <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={sk} onChange={e => onSession(e.target.value)}>
            <option value="">Select Session</option>
            {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_name}</option>)}
          </select>
        </div>
      )}
      {/* Driver */}
      {drivers.length > 0 && (
        <div className="fade-in" style={{ flex: 1, padding: "14px 18px" }}>
          <div style={{
            fontSize: 9, fontWeight: 600, color: "#5a5a6e",
            textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
          }}>DRIVER</div>
          <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={dn} onChange={e => onDriver(e.target.value)}>
            <option value="">Select Driver ({drivers.length})</option>
            {drivers.map(d => <option key={d.driver_number} value={d.driver_number}>#{d.driver_number} {d.full_name} {"\u2014"} {d.team_name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
