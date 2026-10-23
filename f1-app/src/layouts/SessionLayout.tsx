// Analysis page layout — minimal session tabs above content.
// Navigation is URL-driven (year / meetingKey / sessionKey), no setters.

import { useSession } from "../contexts/SessionContext";
import Segmented from "../ui/Segmented";
import type { ReactNode } from "react";

// ── Session tabs ────────────────────────────────────────────────────
function SessionTabs() {
  const { sessions, mk } = useSession();

  if (!sessions.length) return null;

  return (
    <Segmented
      options={sessions.map((s: any) => ({
        key: s.session_name,
        label: s.session_name,
      }))}
      value={sessions[0]?.session_name || "Race"}
      onChange={(key: string) => {
        const s = sessions.find((s: any) => s.session_name === key);
        if (s && mk) {
          window.location.href = `/${s.year || 2024}/${mk}/${s.session_key}`;
        }
      }}
      variant="inverted"
      size="sm"
    />
  );
}

// ── Page shell ──────────────────────────────────────────────────────
export default function SessionLayout({ children }: { children?: ReactNode }) {
  const { sessions } = useSession();

  return (
    <>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 0" }}>
        {/* Session tabs — minimal, one row */}
        {sessions.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <SessionTabs />
          </div>
        )}

        {/* Content — no extra chrome, just the data */}
        {children}
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
