import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { F, C } from "../lib/styles";
import { paths } from "../lib/constants";
import LatestRaceCard from "../components/home/LatestRaceCard";
import ConstructorPaceTile from "../components/home/ConstructorPaceTile";
import TeammateGapTile from "../components/home/TeammateGapTile";
import SeasonGrid from "../components/home/SeasonGrid";

export default function HomePage() {
  const { year, sessions, mk, sk, loading } = useSession();
  const navigate = useNavigate();

  // Preserve the existing UX: when a meeting is selected via SelectorBar
  // (sets `mk`), auto-pick the most recent started session (typically Race)
  // and jump straight to analysis. Filters by mk to avoid using the
  // PREVIOUS meeting's stale session list during the in-flight refetch.
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

  // While a meeting is mid-resolve, the SessionLayout spinner covers the
  // window — don't flash dashboard content underneath.
  if (mk) return null;

  return (
    <div className="fade-in-up" style={{
      maxWidth: 980,
      margin: "12px auto 0",
      padding: "0 4px",
      fontFamily: F,
    }}>
      <div style={{
        fontSize: 12,
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

      <LatestRaceCard year={year} />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 10,
        marginTop: 12,
      }}>
        <ConstructorPaceTile year={year} />
        <TeammateGapTile year={year} />
      </div>

      <SeasonGrid year={year} />
    </div>
  );
}
