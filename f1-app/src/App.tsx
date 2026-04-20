import { Routes, Route, Navigate } from "react-router-dom";
import SessionLayout from "./layouts/SessionLayout";
import HomePage from "./pages/HomePage";
import AnalysisPage from "./pages/AnalysisPage";
import DriverPage from "./pages/DriverPage";
import LegacyRedirect from "./components/LegacyRedirect";
import { DEFAULT_ANALYSIS_TAB, DEFAULT_DRIVER_TAB } from "./lib/constants";

export default function App() {
  return (
    <>
      <LegacyRedirect />
      <Routes>
        <Route element={<SessionLayout />}>
          <Route index element={<HomePage />} />
          <Route path=":year" element={<HomePage />} />
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
