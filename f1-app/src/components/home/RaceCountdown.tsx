import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  country_name?: string;
  location?: string;
  circuit_short_name?: string;
}

// A sticky race-day countdown that sits at the top of the homepage during
// race weekends.  Shows a live clock down to the next session's start
// and links straight to the session analysis when it's time.
//
// This is the single biggest traffic lever: F1 fans search for live timing
// *during* the session — not after.  The banner appears 48h before lights
// out and auto-dismisses 2h after chequered.
export default function RaceCountdown() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now());
  const [target, setTarget] = useState<{ session: Session; meeting: Session } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api("/sessions")
      .then((d: Session[]) => {
        if (!cancelled) setSessions(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Update every second for live countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Find the next session within 48h, or the current live session
  useEffect(() => {
    if (!sessions.length) return;

    for (const s of sessions) {
      if (!s.date_start) continue;
      const start = new Date(s.date_start).getTime();
      // If session is within 48h window (2h after chequered to 48h before)
      if (start >= now - 7200000 && start <= now + 48 * 3600000) {
        setTarget({ session: s, meeting: s });
        return;
      }
    }
    setTarget(null);
  }, [sessions, now]);

  if (!target) return null;

  const { session } = target;
  const startTime = new Date(session.date_start);
  const diffMs = startTime.getTime() - now;

  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);

  const isLive = diffMs <= 0 && diffMs > -7200000; // within 2h of start

  const mk = session.meeting_key;
  const sk = session.session_key;
  const year = sessions.find(s => s.meeting_key === mk)?.date_start?.slice(0, 4) || "2026";
  const raceUrl = `/2026/${mk}`;

  // Format: pad with leading zeros
  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: isLive
        ? "linear-gradient(135deg, rgba(225,6,0,0.95), rgba(180,5,0,0.95))"
        : "linear-gradient(135deg, rgba(100,60,225,0.95), rgba(60,40,180,0.95))",
      backdropFilter: "blur(12px)",
      borderRadius: 12,
      padding: "10px 16px",
      margin: "0 0 14px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: isLive
        ? "0 0 20px rgba(225,6,0,0.3), 0 2px 8px rgba(0,0,0,0.3)"
        : "0 0 20px rgba(100,60,225,0.2), 0 2px 8px rgba(0,0,0,0.3)",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {/* Live indicator */}
      <div style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: isLive ? "#fff" : "rgba(255,255,255,0.7)",
        boxShadow: isLive ? "0 0 8px rgba(255,255,255,0.8)" : "none",
        animation: isLive ? "pulse 1.5s ease-in-out infinite" : "none",
        flexShrink: 0,
      }} />

      {/* Country & Session name */}
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
          opacity: 0.7,
          marginBottom: 2,
        }}>
          {session.session_name} — {session.country_name || session.location || "Grand Prix"}
        </div>
        <div style={{
          fontSize: 15,
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {session.circuit_short_name || session.location || "Grand Prix"}
        </div>
      </div>

      {/* Countdown */}
      <div style={{
        display: "flex",
        gap: 2,
        alignItems: "baseline",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 22,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
          color: "#fff",
        }}>
          {isLive ? "LIVE" : `${hh}:${mm}:${ss}`}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          opacity: 0.7,
          marginLeft: 4,
        }}>
          {isLive ? "IN PROGRESS" : "UNTIL START"}
        </span>
      </div>

      {/* Link to race analysis */}
      <a
        href={isLive ? `/${year}/${mk}/${sk}/analysis/overview` : raceUrl}
        style={{
          padding: "6px 14px",
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          borderRadius: 999,
          textDecoration: "none",
          flexShrink: 0,
          transition: "background 0.2s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.35)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
      >
        {isLive ? "View Race →" : "View Details →"}
      </a>
    </div>
  );
}
