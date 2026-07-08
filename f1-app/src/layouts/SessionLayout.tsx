import { useCallback } from "react";
import { Outlet, useParams, useNavigate, useMatch } from "react-router-dom";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import Header from "../components/shell/Header";
import SelectorBar from "../components/shell/SelectorBar";
import DriverGrid from "../components/shell/DriverGrid";
import Footer from "../components/shell/Footer";
import LiveSessionBanner from "../components/LiveSessionBanner";
import { SkeletonAnalysis, SkeletonHome } from "../components/Skeleton";
import { F, C, sty } from "../lib/styles";
import { paths } from "../lib/constants";
import Pill from "../components/Pill";

function LayoutInner() {
  const { year, meetings, sessions, drivers, mk, sk, loading, error, clearError, retry } = useSession();
  const params = useParams();
  const navigate = useNavigate();

  const dn = params.driverNumber || "";
  const isDriver = !!useMatch("/:year/:mk/:sk/driver/:dn/:tab");

  const onReset = useCallback(() => navigate(paths.home()), [navigate]);
  const onMeeting = useCallback((meetingKey: string) => navigate(paths.meeting(year, meetingKey)), [navigate, year]);
  const onSession = useCallback((sessionKey: string) => navigate(paths.analysis(year, mk, sessionKey)), [navigate, year, mk]);
  const onDriver = useCallback((driverNumber: string) => navigate(paths.driver(year, mk, sk, driverNumber)), [navigate, year, mk, sk]);

  return (
    <div style={sty.bg}>
      <Header
        meetings={meetings}
        mk={mk}
        sessions={sessions}
        sk={sk}
        drivers={isDriver ? drivers : undefined}
        dn={isDriver ? dn : undefined}
        onReset={onReset}
      />

      <main style={{
        padding: "clamp(12px, 3vw, 24px) clamp(12px, 4vw, 28px)",
        maxWidth: 1400,
        margin: "0 auto",
      }}>
        <LiveSessionBanner />

        {error && (
          <div style={sty.err}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={retry} style={{
              background: "transparent",
              border: "1px solid " + C.border,
              color: "#ffb5ab",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 6,
              fontFamily: F,
            }}>Retry</button>
            <button onClick={clearError} style={{
              background: "none",
              border: "none",
              color: "#ffb5ab",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 500,
              padding: 4,
              lineHeight: 1,
            }}>×</button>
          </div>
        )}

        <SelectorBar
          meetings={meetings}
          mk={mk}
          sessions={sessions}
          sk={sk}
          onMeeting={onMeeting}
          onSession={onSession}
        />

        {drivers.length > 0 && !loading && (
          <DriverGrid drivers={drivers} dn={dn} onDriver={onDriver} />
        )}

        {drivers.length > 0 && !loading && sk && (
          <div style={{
            display: "inline-flex",
            gap: 2,
            marginBottom: 18,
            background: C.surface,
            borderRadius: 999,
            padding: 3,
            border: "1px solid " + C.border,
          }}>
            <Pill
              size="lg"
              variant="inverted"
              active={!isDriver}
              onClick={() => navigate(paths.analysis(year, mk, sk))}>
              Race analysis
            </Pill>
            <Pill
              size="lg"
              variant="inverted"
              active={isDriver}
              onClick={() => {
                if (dn) navigate(paths.driver(year, mk, sk, dn));
                else if (drivers.length > 0) navigate(paths.driver(year, mk, sk, String(drivers[0].driver_number)));
              }}>
              Driver view
            </Pill>
          </div>
        )}

        {/* Layout-matching skeleton keeps the page shape during navigation
            instead of collapsing to a centered spinner. Analysis-shaped when a
            meeting is selected, season-dashboard-shaped on the home route. */}
        {loading && (mk ? <SkeletonAnalysis label={loading} /> : <SkeletonHome />)}

        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

export default function SessionLayout() {
  return (
    <SessionProvider>
      <LayoutInner />
    </SessionProvider>
  );
}
