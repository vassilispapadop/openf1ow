// One component for every "nothing to show here" moment, including the
// engine's gated results. Kinds:
//   no-data      the input was not published for this session
//   not-enough   below the minimum sample (says how many, needs how many)
//   unsupported  not applicable here (e.g. race pace on qualifying)
//   pending      rate-limited by the data source; auto-retrying
//   error        something actually broke
//
// `<Gate>` wraps an engine Gated<T> and renders the value or the reason.

import type { ReactNode } from "react";
import s from "./EmptyState.module.css";
import { describeGate, type Gated } from "../engine/types/gated.ts";

export type EmptyKind = "no-data" | "not-enough" | "unsupported" | "pending" | "error";

const DEFAULT_TITLE: Record<EmptyKind, string> = {
  "no-data": "No data for this",
  "not-enough": "Not enough data yet",
  unsupported: "Not applicable to this session",
  pending: "Waiting for session data",
  error: "Couldn't load this",
};

export default function EmptyState({ kind = "no-data", what, title, detail, action, inline, className }: {
  kind?: EmptyKind;
  what?: string;                    // "pit stops", "weather" — fills the default title
  title?: ReactNode;
  detail?: ReactNode;
  action?: { label: string; onClick: () => void; ghost?: boolean };
  inline?: boolean;
  className?: string;
}) {
  const heading = title ?? (what && kind === "no-data" ? `No ${what} data for this session` : DEFAULT_TITLE[kind]);
  return (
    <div className={[s.root, inline && s.inline, className].filter(Boolean).join(" ")} role={kind === "error" ? "alert" : "status"}>
      {kind === "pending" && <div className={`${s.icon} ${s.pulse}`} aria-hidden="true">●</div>}
      <div style={{ minWidth: 0 }}>
        <p className={s.title}>{heading}</p>
        {detail && <p className={s.detail}>{detail}</p>}
      </div>
      {action && (
        <button type="button" className={`${s.action} ${action.ghost ? s.ghost : ""}`} onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}

/** Rate-limited state with the auto-retry semantics the analysis pages use. */
export function Pending({ onRetry, checking, exhausted }: { onRetry: () => void; checking?: boolean; exhausted?: boolean }) {
  return (
    <EmptyState
      kind="pending"
      detail={<>
        Timing data for this session isn't published yet — the F1 data source rate-limits during and just after a live session.{" "}
        {exhausted ? "It should appear once the session data is released." : "Retrying automatically…"}
      </>}
      action={{ label: checking ? "Checking…" : "Try again", onClick: onRetry }}
    />
  );
}

/** Render an engine result, or the reason it isn't there. */
export function Gate<T>({ result, what, inline = true, children }: {
  result: Gated<T>;
  what?: string;
  inline?: boolean;
  children: (value: T, meta: { n: number; confidence: "high" | "medium" | "low"; notes?: string[] }) => ReactNode;
}) {
  if (result.ok) return <>{children(result.value, { n: result.n, confidence: result.confidence, notes: result.notes })}</>;
  const kind: EmptyKind =
    result.reason === "too_few_laps" || result.reason === "no_clean_laps" ? "not-enough"
    : result.reason === "wrong_session_kind" ? "unsupported"
    : "no-data";
  return <EmptyState kind={kind} what={what} inline={inline} detail={describeGate(result)} />;
}
