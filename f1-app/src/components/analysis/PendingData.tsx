import { sty } from "../../lib/styles";
import { Pending } from "../../ui";

// A 429 from OpenF1 is transient and expected during/after a live session
// (timing data isn't published or cached yet) — not a real error.
export function isRateLimited(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | undefined;
  return err?.code === "RATE_LIMITED" || /HTTP 429/.test(err?.message || "");
}

// Calm "data not ready yet" state shown in place of a hard error while a
// rate-limited session load auto-retries. The chrome lives in ui/EmptyState;
// this keeps the card wrapper the pages expect.
export function PendingData({ onRetry, checking, exhausted }: {
  onRetry: () => void;
  checking?: boolean;
  exhausted?: boolean;
}) {
  return (
    <div style={sty.card}>
      <Pending onRetry={onRetry} checking={checking} exhausted={exhausted} />
    </div>
  );
}
