import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { F, C } from "../lib/styles";
import { paths } from "../lib/constants";

export default function HomePage() {
  const { year, meetings, sessions, mk, sk, loading } = useSession();
  const navigate = useNavigate();

  // Auto-pick the most recent past meeting when landing with no meeting
  useEffect(() => {
    if (loading || meetings.length === 0 || mk) return;
    const now = new Date();
    const past = meetings.filter((m: any) => m.date_start && new Date(m.date_start) < now);
    const latest = past.length ? past[past.length - 1] : meetings[0];
    navigate(paths.meeting(year, String(latest.meeting_key)), { replace: true });
  }, [meetings, mk, loading, year, navigate]);

  // Auto-pick Race session once a meeting is selected
  useEffect(() => {
    if (loading || sessions.length === 0 || sk || !mk) return;
    const race = sessions.find((s: any) => s.session_name === "Race") || sessions[sessions.length - 1];
    navigate(paths.analysis(year, mk, String(race.session_key)), { replace: true });
  }, [sessions, sk, mk, loading, year, navigate]);

  if (sk) return null;

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
        {!mk ? "Loading latest race…" : "Loading sessions…"}
      </div>
    </div>
  );
}
