import { F, C, sty } from "../../lib/styles";

// A 429 from OpenF1 is transient and expected during/after a live session
// (timing data isn't published or cached yet) — not a real error.
export function isRateLimited(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | undefined;
  return err?.code === "RATE_LIMITED" || /HTTP 429/.test(err?.message || "");
}

// Calm "data not ready yet" state shown in place of a hard error while a
// rate-limited session load auto-retries.
export function PendingData({ onRetry, checking, exhausted }: {
  onRetry: () => void;
  checking?: boolean;
  exhausted?: boolean;
}) {
  return (
    <div style={sty.card}>
      <div style={{ textAlign: "center", padding: "32px 20px", maxWidth: 460, margin: "0 auto" }}>
        <h3 style={{ ...sty.sectionHead, marginBottom: 8 }}>Waiting for session data</h3>
        <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 18px", lineHeight: 1.55 }}>
          Timing data for this session isn't published yet — the F1 data source rate-limits during and
          just after a live session.{" "}
          {exhausted ? "It should appear once the session data is released." : "Retrying automatically…"}
        </p>
        <button onClick={onRetry} style={{
          background: C.accent, color: "#fff", border: "none", borderRadius: 10,
          padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F,
        }}>
          {checking ? "Checking…" : "Try again"}
        </button>
      </div>
    </div>
  );
}
