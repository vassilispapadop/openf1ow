import { useRef, useEffect } from "react";
import { F, M } from "../../lib/styles";

interface SelectorBarProps {
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
  onMeeting: (v: string) => void;
  onSession: (v: string) => void;
}

export default function SelectorBar({ meetings, mk, sessions, sk, onMeeting, onSession }: SelectorBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const races = meetings.filter(m => !m.meeting_name?.toLowerCase().includes("testing"));

  // Auto-scroll selected race into view
  useEffect(() => {
    if (!scrollRef.current || !mk) return;
    const el = scrollRef.current.querySelector(`[data-mk="${mk}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [mk]);

  return (
    <div>
      {/* Race strip */}
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "8px 0 12px",
          scrollbarWidth: "none",
        }}
      >
        {races.map(m => {
          const selected = String(m.meeting_key) === mk;
          const isPast = new Date(m.date_start) < new Date();
          return (
            <button
              key={m.meeting_key}
              data-mk={m.meeting_key}
              onClick={() => onMeeting(String(m.meeting_key))}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px 6px 6px",
                borderRadius: 10,
                border: selected ? "2px solid #e10600" : "2px solid transparent",
                background: selected
                  ? "rgba(225,6,0,0.08)"
                  : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                outline: "none",
                opacity: isPast ? 1 : 0.4,
              }}
            >
              {m.country_flag && (
                <img
                  src={m.country_flag}
                  alt=""
                  style={{
                    width: 28,
                    height: 18,
                    borderRadius: 3,
                    objectFit: "cover",
                  }}
                />
              )}
              <div style={{ textAlign: "left" }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: F,
                  color: selected ? "#e8e8ec" : "#5a5a6e",
                  whiteSpace: "nowrap",
                }}>
                  {m.circuit_short_name || m.location || m.country_name}
                </div>
                <div style={{
                  fontSize: 8,
                  fontFamily: M,
                  color: selected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)",
                  whiteSpace: "nowrap",
                }}>
                  {new Date(m.date_start).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Session pills */}
      {sessions.length > 0 && (
        <div style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
        }}>
          {sessions.map(s => {
            const selected = String(s.session_key) === sk;
            return (
              <button
                key={s.session_key}
                onClick={() => onSession(String(s.session_key))}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: selected
                    ? "linear-gradient(135deg, #e10600, #b80500)"
                    : "rgba(255,255,255,0.03)",
                  color: selected ? "#fff" : "#5a5a6e",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: F,
                  cursor: "pointer",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.8px",
                  transition: "all 0.2s ease",
                  outline: "none",
                  boxShadow: selected ? "0 2px 10px rgba(225,6,0,0.3)" : "none",
                }}
              >
                {s.session_name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
