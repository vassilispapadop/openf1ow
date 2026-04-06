import { sty } from "../../lib/styles";

interface SelectorBarProps {
  year: number;
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
  onYear: (y: number) => void;
  onMeeting: (v: string) => void;
  onSession: (v: string) => void;
}

export default function SelectorBar({ year, meetings, mk, sessions, sk, onYear, onMeeting, onSession }: SelectorBarProps) {
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
          <option value={2026}>2026</option>
        </select>
      </div>
      {/* Race */}
      <div style={{ flex: 1, padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{
          fontSize: 9, fontWeight: 600, color: "#5a5a6e",
          textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6,
        }}>RACE</div>
        <select style={{ ...sty.sel, width: "100%", boxSizing: "border-box" as const }} value={mk} onChange={e => onMeeting(e.target.value)}>
          <option value="">Select Race ({meetings.filter(m => !m.meeting_name?.toLowerCase().includes("testing")).length})</option>
          {meetings.filter(m => !m.meeting_name?.toLowerCase().includes("testing")).map(m => <option key={m.meeting_key} value={m.meeting_key}>{m.country_name} {"\u2014"} {m.meeting_name}</option>)}
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
    </div>
  );
}
