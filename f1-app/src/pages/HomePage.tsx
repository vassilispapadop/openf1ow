import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { api } from "../lib/api";
import { F, C } from "../lib/styles";
import { paths } from "../lib/constants";

export default function HomePage() {
  const { year, meetings, sessions, mk, sk, loading } = useSession();
  const navigate = useNavigate();

  // Auto-pick the latest Race session that actually has data. OpenF1 flags
  // yet-to-be-uploaded race sessions with is_cancelled=true — using it to pick
  // lands us on a race that really happened instead of an empty analysis page.
  useEffect(() => {
    if (loading || meetings.length === 0 || mk) return;
    let cancelled = false;
    api(`/sessions?year=${year}&session_name=Race`)
      .then((races: any[]) => {
        if (cancelled) return;
        const now = Date.now();
        const ready = races
          .filter(s => !s.is_cancelled && s.date_start && new Date(s.date_start).getTime() < now)
          .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
        const latest = ready[ready.length - 1];
        if (latest) {
          navigate(paths.analysis(year, String(latest.meeting_key), String(latest.session_key)), { replace: true });
        }
      })
      .catch(() => { /* silent — hero stays visible, user picks manually */ });
    return () => { cancelled = true; };
  }, [meetings, mk, loading, year, navigate]);

  // Auto-pick Race session once a meeting is selected (user clicked a race in
  // SelectorBar). Falls back to the last session listed if Race isn't present.
  useEffect(() => {
    if (loading || sessions.length === 0 || sk || !mk) return;
    const race = sessions.find(s => s.session_name === "Race") || sessions[sessions.length - 1];
    navigate(paths.analysis(year, mk, String(race.session_key)), { replace: true });
  }, [sessions, sk, mk, loading, year, navigate]);

  // Only show the landing hero when no meeting has been picked. Once mk is set
  // we're one navigate() away from the analysis page — the spinner in
  // SessionLayout covers that window, no need to flash the hero.
  if (mk) return null;

  return (
    <div className="fade-in-up" style={{
      maxWidth: 720,
      margin: "48px auto 0",
      padding: "0 4px",
    }}>
      <div style={{
        fontFamily: F,
        fontSize: 13,
        fontWeight: 600,
        color: C.textMute,
        marginBottom: 14,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
        <span>F1 · {year} season</span>
      </div>

      <h1 style={{
        fontFamily: F,
        fontSize: "clamp(40px, 6vw, 64px)",
        fontWeight: 700,
        lineHeight: 1.02,
        letterSpacing: "-0.03em",
        color: C.text,
        margin: "0 0 18px",
      }}>
        The race, <span style={{ color: C.textMute }}>explained</span>.
      </h1>

      <p style={{
        fontFamily: F,
        fontSize: 17,
        lineHeight: 1.5,
        color: C.textDim,
        fontWeight: 400,
        margin: "0 0 28px",
        maxWidth: 580,
      }}>
        Post-race analysis for people with opinions. Who was actually fastest? Did the tire strategy work? Was the teammate gap on merit? Pick a Grand&nbsp;Prix above to dig in.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 10,
        marginTop: 24,
      }}>
        {[
          ["Pace", "Median pace, sector deltas, lap evolution"],
          ["Strategy", "Tire deg, fuel model, pit efficiency"],
          ["Battles", "Teammate duels, constructor gaps, dirty air"],
          ["AI verdict", "Gemini-written race breakdown"],
        ].map(([title, sub]) => (
          <div
            key={title}
            style={{
              padding: "14px 16px",
              border: "1px solid " + C.border,
              borderRadius: 12,
              background: C.surface,
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: C.textMute, lineHeight: 1.45 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 36,
        fontSize: 12,
        color: C.textFaint,
        fontFamily: F,
      }}>
        Loading latest race…
      </div>
    </div>
  );
}
