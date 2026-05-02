import { useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { ANALYSIS_VIEWS, DEFAULT_ANALYSIS_TAB, TAB_REDIRECT, type ViewKey } from "../lib/constants";
import { classifySession } from "../lib/sessionAnalysis";
import RaceAnalysis from "../RaceAnalysis";
import QualifyingAnalysis from "../components/session/QualifyingAnalysis";
import PracticeAnalysis from "../components/session/PracticeAnalysis";

const VIEW_KEYS = new Set<string>(ANALYSIS_VIEWS.map(v => v.key));
const isViewKey = (s: string | undefined): s is ViewKey => !!s && VIEW_KEYS.has(s);

export default function AnalysisPage() {
  const { subTab } = useParams<{ subTab?: string }>();
  const navigate = useNavigate();
  const { sk, drivers, weather, rc, results, meetings, sessions, mk, year } = useSession();

  useEffect(() => {
    if (subTab && TAB_REDIRECT[subTab]) {
      navigate(`../${TAB_REDIRECT[subTab]}`, { relative: "path", replace: true });
    }
  }, [subTab, navigate]);

  const onSubTabChange = useCallback((tab: ViewKey) => {
    navigate(`../${tab}`, { relative: "path" });
  }, [navigate]);

  if (!sk || drivers.length === 0) return null;

  const redirected = subTab ? TAB_REDIRECT[subTab] : undefined;
  const view: ViewKey = redirected ?? (isViewKey(subTab) ? subTab : DEFAULT_ANALYSIS_TAB);

  const meeting = meetings.find((m: any) => String(m.meeting_key) === mk);
  const session = sessions.find((s: any) => String(s.session_key) === sk);
  const raceMeta = {
    meetingName: meeting?.meeting_name,
    circuit: meeting?.circuit_short_name,
    country: meeting?.country_name,
    year,
    sessionName: session?.session_name,
  };

  // Race-shaped analysis (median pace, fuel-corrected deg, dirty air, pit
  // stops) only makes sense for actual races. Qualifying and Practice get
  // session-appropriate views instead.
  const kind = classifySession(session?.session_type, session?.session_name);

  if (kind === "qualifying") {
    return (
      <div className="fade-in-up">
        <QualifyingAnalysis sessionKey={sk} drivers={drivers} sessionName={session?.session_name} />
      </div>
    );
  }
  if (kind === "practice") {
    return (
      <div className="fade-in-up">
        <PracticeAnalysis sessionKey={sk} drivers={drivers} sessionName={session?.session_name} />
      </div>
    );
  }

  // Race / Sprint — full analysis stack.
  return (
    <div className="fade-in-up">
      <RaceAnalysis
        sessionKey={sk}
        drivers={drivers}
        weather={weather}
        raceControl={rc}
        results={results}
        raceMeta={raceMeta}
        subTab={view}
        onSubTabChange={onSubTabChange}
      />
    </div>
  );
}
