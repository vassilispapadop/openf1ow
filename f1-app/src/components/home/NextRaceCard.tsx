// Next race card — flat surface, bold countdown timer.
// No gradients, no decorative dots.

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { downloadICS, googleCalUrl, type CalEvent } from "../../lib/calendar";

interface Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  country_name?: string;
  location?: string;
  circuit_short_name?: string;
}

// Rough session lengths (OpenF1 gives no end time).
const DURATION_MIN: Record<string, number> = {
  "Practice 1": 60, "Practice 2": 60, "Practice 3": 60,
  "Sprint Qualifying": 45, "Sprint": 60, "Qualifying": 60, "Race": 120,
};
const endOf = (s: Session) =>
  new Date(new Date(s.date_start).getTime() + (DURATION_MIN[s.session_name] ?? 90) * 60000);

function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 86400000) % 3600000 / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function NextRaceCard({ year }: { year: number }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api(`/sessions?year=${year}`)
      .then((d: Session[]) => { if (!cancelled) setSessions(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setSessions([]); });
    return () => { cancelled = true; };
  }, [year]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!sessions) return <div style={{ height: 200, marginBottom: 12 }} aria-busy="true" />;
  const upcoming = sessions
    .filter(s => s.date_start && new Date(s.date_start).getTime() > now)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
  if (!upcoming.length) return null;

  const next = upcoming[0];
  const mk = next.meeting_key;
  const weekend = sessions
    .filter(s => s.meeting_key === mk && s.date_start)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
  const race = weekend.find(s => s.session_name === "Race") || weekend[weekend.length - 1];
  const raceUpcoming = race && new Date(race.date_start).getTime() > now;
  const target = raceUpcoming ? race : next;

  const country = next.country_name || next.location || "Grand Prix";
  const circuit = next.circuit_short_name || next.location || "";

  const events: CalEvent[] = weekend
    .filter(s => new Date(s.date_start).getTime() > now)
    .map(s => ({
      title: `F1 ${country} GP — ${s.session_name}`,
      start: new Date(s.date_start),
      end: endOf(s),
      location: circuit,
      description: `${country} Grand Prix ${s.session_name}. Live analysis & telemetry on OpenF1ow`,
      url: "https://www.openf1ow.com",
    }));
  const raceEvent = events.find(e => e.title.endsWith("Race")) || events[events.length - 1];

  const fmt = new Date(target.date_start).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const calIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "24px 28px",
      marginBottom: 12,
    }}>
      {/* Label — flat, no dot */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-faint)",
      }}>
        NEXT RACE
      </div>

      {/* Race name + countdown */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{
          fontSize: "clamp(22px, 3.5vw, 30px)",
          fontWeight: 800,
          margin: 0,
          letterSpacing: "-0.02em",
          color: "var(--text)",
        }}>
          {country} Grand Prix
        </h2>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{circuit}</span>
      </div>

      {/* Big countdown number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "10px 0 4px" }}>
        <span style={{
          fontSize: "clamp(28px, 5vw, 40px)",
          fontWeight: 800,
          color: "var(--text)",
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {countdown(new Date(target.date_start).getTime() - now)}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          to {target.session_name === "Race" ? "lights out" : target.session_name}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        {target.session_name} · {fmt} <span style={{ color: "var(--text-faint)" }}>(your time)</span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {raceEvent && (
          <a href={googleCalUrl(raceEvent)} target="_blank" rel="noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px",
            background: "var(--accent)", color: "#fff",
            borderRadius: "var(--radius-sm)",
            fontSize: 12, fontWeight: 600,
            textDecoration: "none",
          }}>{calIcon} Google Calendar</a>
        )}
        {events.length > 0 && (
          <button
            onClick={() => downloadICS(events, `f1-${country.toLowerCase().replace(/\s+/g, "-")}-gp.ics`)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px",
              background: "transparent", color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12, fontWeight: 500,
              cursor: "pointer",
              transition: "border-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {calIcon} Add full weekend (.ics)
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
        Adds {events.length} session{events.length === 1 ? "" : "s"} with a 30-min reminder each.
      </div>
    </div>
  );
}
