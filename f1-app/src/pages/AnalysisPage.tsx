import { useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { ANALYSIS_VIEWS, DEFAULT_ANALYSIS_TAB, TAB_REDIRECT, type ViewKey } from "../lib/constants";
import RaceAnalysis from "../RaceAnalysis";

const VIEW_KEYS = new Set<string>(ANALYSIS_VIEWS.map(v => v.key));
const isViewKey = (s: string | undefined): s is ViewKey => !!s && VIEW_KEYS.has(s);

export default function AnalysisPage() {
  const { subTab } = useParams<{ subTab?: string }>();
  const navigate = useNavigate();
  const { sk, drivers, weather, rc, results } = useSession();

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

  return (
    <div className="fade-in-up">
      <RaceAnalysis
        sessionKey={sk}
        drivers={drivers}
        weather={weather}
        raceControl={rc}
        results={results}
        subTab={view}
        onSubTabChange={onSubTabChange}
      />
    </div>
  );
}
