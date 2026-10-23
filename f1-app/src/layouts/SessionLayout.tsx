// Analysis page layout — minimal session tabs above content.
// Navigation is URL-driven (year / meetingKey / sessionKey), no setters.

import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { paths } from "../lib/constants";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import { recordLastRace } from "../lib/retention";
import Header from "../components/shell/Header";
import LiveSessionBanner from "../components/LiveSessionBanner";
import { SkeletonAnalysis } from "../components/Skeleton";
import Segmented from "../ui/Segmented";
import type { ReactNode } from "react";

// ── Session tabs ────────────────────────────────────────────────────
function SessionTabs() {
  const { sessions, year, mk, sk } = useSession();
  const navigate = useNavigate();

  if (!sessions.length) return null;

  return (
    <Segmented
      options={sessions.map((s: any) => ({
        key: String(s.session_key),
        label: s.session_name,
      }))}
      value={sk}
      onChange={(key: string) => {
        if (mk) navigate(paths.analysis(year, mk, key));
      }}
      variant="inverted"
      size="sm"
    />
  );
}

// ── Page shell ──────────────────────────────────────────────────────
function LayoutInner({ children }: { children?: ReactNode }) {
  const { sessions, meetings, mk, sk, loading, error, clearError, retry } = useSession();

  // Remember the last race/session viewed so the home page can offer "Resume".
  useEffect(() => {
    if (!mk || !sk) return;
    const meeting = meetings.find((m: any) => String(m.meeting_key) === mk);
    if (!meeting) return;
    const session = sessions.find((s: any) => String(s.session_key) === sk);
    const label = `${meeting.meeting_name}${session?.session_name ? " · " + session.session_name : ""}`;
    recordLastRace({ path: window.location.pathname + window.location.search, label, ts: Date.now() });
  }, [mk, sk, meetings, sessions]);

  return (
    <>
      <Header />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 0" }}>
        <LiveSessionBanner />

        {error && (
          <div role="alert" style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
            padding: "10px 14px", borderRadius: 8, fontSize: 13,
            border: "1px solid var(--border)", color: "#ffb5ab",
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={retry} style={{ background: "transparent", border: "1px solid var(--border)", color: "inherit", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6 }}>Retry</button>
            <button onClick={clearError} aria-label="Dismiss" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Session tabs — minimal, one row */}
        {sessions.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <SessionTabs />
          </div>
        )}

        {/* Skeleton keeps the page shape while a meeting's data loads */}
        {loading && mk && <SkeletonAnalysis label={loading} />}

        {/* Content — no extra chrome, just the data */}
        {!(loading && mk) && (children ?? <Outlet />)}
      </div>

      {/* Footer */}
      <footer style={{
        maxWidth: 1200,
        margin: "48px auto 0",
        padding: "16px 20px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 11,
        color: "var(--text-muted)",
        fontFamily: "var(--font)",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <span>
          <span style={{ color: "var(--text-dim)" }}>openf1</span>
          <span style={{ color: "var(--accent)" }}>ow</span>
          <span style={{ marginLeft: 10, color: "var(--text-faint)" }}>not affiliated with Formula 1</span>
        </span>
        <span style={{ display: "inline-flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <a href="/insights" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>recaps</a>
          <a href="/about" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>about · methodology</a>
          <span>data · <a href="https://openf1.org" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>openf1.org</a></span>
        </span>
      </footer>
    </>
  );
}

export default function SessionLayout({ children }: { children?: ReactNode }) {
  return (
    <SessionProvider>
      <LayoutInner>{children}</LayoutInner>
    </SessionProvider>
  );
}
