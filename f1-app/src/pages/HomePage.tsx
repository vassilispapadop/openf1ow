import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { F, C } from "../lib/styles";
import { paths } from "../lib/constants";

export default function HomePage() {
  const { year, sessions, mk, sk, loading } = useSession();
  const navigate = useNavigate();

  // Auto-pick the last available session once a meeting is selected (user
  // clicked a race in SelectorBar). Prefers the latest session that has
  // already started; falls back to Race by name, then the last listed.
  //
  // Filter by meeting_key first — after switching meetings, `sessions` is
  // briefly the PREVIOUS meeting's list until SessionContext refetches. Picking
  // blindly from that stale list would navigate to /newmk/OLDsk, leaving the
  // analysis page stuck on the previous race's data.
  useEffect(() => {
    if (loading || sk || !mk) return;
    const own = sessions.filter(s => String(s.meeting_key) === mk);
    if (own.length === 0) return;
    const now = Date.now();
    const started = own
      .filter(s => s.date_start && new Date(s.date_start).getTime() < now)
      .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    const pick = started[started.length - 1]
      || own.find(s => s.session_name === "Race")
      || own[own.length - 1];
    navigate(paths.analysis(year, mk, String(pick.session_key)), { replace: true });
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

    </div>
  );
}
