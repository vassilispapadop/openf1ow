import { useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../contexts/SessionContext";
import { DEFAULT_ANALYSIS_TAB, TAB_REDIRECT } from "../lib/constants";
import RaceAnalysis from "../RaceAnalysis";

export default function AnalysisPage() {
  const { subTab } = useParams<{ subTab: string }>();
  const navigate = useNavigate();
  const { sk, drivers, weather, rc, results } = useSession();

  // Legacy tab → new view
  useEffect(() => {
    if (subTab && TAB_REDIRECT[subTab]) {
      navigate(`../${TAB_REDIRECT[subTab]}`, { relative: "path", replace: true });
    }
  }, [subTab, navigate]);

  const onSubTabChange = useCallback((tab: string) => {
    navigate(`../${tab}`, { relative: "path" });
  }, [navigate]);

  if (!sk || drivers.length === 0) return null;

  const view = (subTab && TAB_REDIRECT[subTab]) || subTab || DEFAULT_ANALYSIS_TAB;

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
