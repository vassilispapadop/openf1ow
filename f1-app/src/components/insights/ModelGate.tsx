// Renders the page body once the session model is ready, and the loading,
// rate-limited or error state until then — the same on every analysis page.

import type { ReactNode } from "react";
import { useSessionModel } from "../../lib/useSessionModel";
import { PendingData } from "../analysis/PendingData";
import { C, sty } from "../../lib/styles";
import type { SessionModel } from "../../engine/index.ts";

export default function ModelGate({ children, loading = "Loading session data…" }: {
  children: (model: SessionModel) => ReactNode;
  loading?: string;
}) {
  const { model, status, error, pendingCount, retry } = useSessionModel();
  if (status === "pending") return <PendingData onRetry={retry} checking={false} exhausted={pendingCount > 4} />;
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
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 36, color: C.textDim, fontSize: 13 }}>{loading}</div>
      </div>
    );
  }
  return <>{children(model)}</>;
}
