import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import SessionLayout from "./layouts/SessionLayout";
import HomePage from "./pages/HomePage";
import AnalysisPage from "./pages/AnalysisPage";
import DriverPage from "./pages/DriverPage";
import SeasonTrendsPage from "./pages/SeasonTrendsPage";
import LegacyRedirect from "./components/LegacyRedirect";
import { DEFAULT_ANALYSIS_TAB, DEFAULT_DRIVER_TAB } from "./lib/constants";
import { trackPageview } from "./lib/analytics";

function PageviewTracker() {
  const location = useLocation();
  useEffect(() => {
    // Defer one tick so document.title updates from per-page useEffect hooks
    // before we send the pageview.
    const id = setTimeout(() => trackPageview(location.pathname + location.search), 0);
    return () => clearTimeout(id);
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  return (
    <>
      <LegacyRedirect />
      <PageviewTracker />
      <Routes>
        <Route element={<SessionLayout />}>
          <Route index element={<HomePage />} />
          <Route path=":year" element={<HomePage />} />
          {/* Static "trends" segment must come before :meetingKey or it
              would be matched as a meeting key. React Router 7's ranker
              prefers static over dynamic, but listing it first is clearer. */}
          <Route path=":year/trends" element={<SeasonTrendsPage />} />
          <Route path=":year/:meetingKey" element={<HomePage />} />
          <Route path=":year/:meetingKey/:sessionKey" element={<Navigate to={`analysis/${DEFAULT_ANALYSIS_TAB}`} replace />} />
          <Route path=":year/:meetingKey/:sessionKey/analysis" element={<Navigate to={DEFAULT_ANALYSIS_TAB} replace />} />
          <Route path=":year/:meetingKey/:sessionKey/analysis/:subTab" element={<AnalysisPage />} />
          <Route path=":year/:meetingKey/:sessionKey/driver/:driverNumber" element={<Navigate to={DEFAULT_DRIVER_TAB} replace />} />
          <Route path=":year/:meetingKey/:sessionKey/driver/:driverNumber/:tab" element={<DriverPage />} />
        </Route>
      </Routes>
    </>
  );
}
