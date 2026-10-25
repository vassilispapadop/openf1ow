// Renders the page body once the session model is ready, and the loading,
// rate-limited or error state until then — the same on every analysis page.

import type { ReactNode } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { PendingData } from "../analysis/PendingData";
import type { SessionModel } from "../../engine/index.ts";
import { sty } from "../../lib/styles";
import { useSession } from "../../contexts/SessionContext";
import EmptyState from "../../ui/EmptyState";
import { isLiveGateMessage } from "../../lib/api";

export default function ModelGate({ children, loading = "Loading session data…" }: {
  children: (model: SessionModel) => ReactNode;
  loading?: string;
}) {
  const { model, status, error, pendingCount, retry } = useSessionModel();
  const { sessions, sk } = useSession();

  // A session that hasn't started has no data to wait for: say when it runs
  // rather than blaming the data source's rate limit.
  const session = sessions.find((x: any) => String(x.session_key) === sk);
  const start = session?.date_start ? new Date(session.date_start) : null;
  if (start && start.getTime() > Date.now()) {
    const when = start.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    return (
      <div style={sty.card}>
        <EmptyState
          kind="no-data"
          title={`${session.session_name} hasn't run yet`}
          detail={`Scheduled for ${when} (your local time). Timing and telemetry appear here once the session is over.`}
        />
      </div>
    );
  }
  if (status === "pending") return <PendingData onRetry={retry} checking={false} exhausted={pendingCount > 4} />;
  if (status === "error" && isLiveGateMessage(error)) {
    return (
      <div style={sty.card}>
        <EmptyState
          kind="pending"
          title="Live session in progress"
          detail="OpenF1 pauses public data until the chequered flag. This page fills in once the session is over."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div style={sty.err}>
        <span style={{ flex: 1 }}>{error}</span>
        <button onClick={retry} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 4 }}>Retry</button>
      </div>
    );
  }
  if (!model) {
    return (
      <div style={{ ...sty.card, minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }} aria-busy="true">
        <div style={{ textAlign: "center", padding: 36, color: 'var(--text-dim)', fontSize: 13 }}>{loading}</div>
      </div>
    );
  }
  return <>{children(model)}</>;
}
