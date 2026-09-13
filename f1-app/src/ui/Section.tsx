// The card every analysis lives in. Owns the title row, the optional hint,
// the "How this is computed" disclosure, a confidence badge, the actions slot
// and the share capture — so a new insight gets all of that for free and no
// card has to hand-roll a header again.

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import s from "./Section.module.css";
import Badge from "./Badge.tsx";
import type { Confidence } from "../engine/types/gated.ts";
import ShareButton from "../components/ShareButton";

export interface Method {
  summary: string;
  steps?: string[];
  caveats?: string[];
  inputs?: string[];
}

export interface SectionProps {
  id?: string;                 // evidence anchor (stable — treated as public API)
  title: ReactNode;
  kicker?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  method?: Method;
  confidence?: Confidence;
  /** Render a share button that captures the body. */
  share?: { meta?: string; filename?: string } | boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  dense?: boolean;
  bodyRef?: RefObject<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}

const CONF_TONE: Record<Confidence, "pos" | "warn" | "mute"> = { high: "pos", medium: "warn", low: "mute" };
const CONF_LABEL: Record<Confidence, string> = { high: "high confidence", medium: "medium confidence", low: "low confidence" };

export default function Section({
  id, title, kicker, hint, actions, method, confidence, share, collapsible, defaultOpen = true, dense, bodyRef, className, children,
}: SectionProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = bodyRef ?? ownRef;
  const rootRef = useRef<HTMLElement>(null);

  // Arriving via a #hash (a verdict's evidence link): scroll under the sticky
  // bars and flash once.
  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    if (window.location.hash !== "#" + id) return;
    const el = rootRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.classList.add(s.flash);
    const t = setTimeout(() => el.classList.remove(s.flash), 1300);
    return () => clearTimeout(t);
  }, [id]);

  const shareProps = share === true ? {} : share || null;

  const head = (
    <header className={s.head}>
      <div className={s.headText}>
        {kicker && <div className={s.kicker}>{kicker}</div>}
        <h3 className={s.title}>
          {title}
          {confidence && <Badge tone={CONF_TONE[confidence]} size="sm" title={CONF_LABEL[confidence]}>{confidence}</Badge>}
        </h3>
        {hint && <p className={s.hint}>{hint}</p>}
      </div>
      {(actions || shareProps) && (
        <div className={s.actions}>
          {actions}
          {shareProps && <ShareButton domRef={ref} meta={shareProps.meta} filename={shareProps.filename} />}
        </div>
      )}
    </header>
  );

  const methodEl = method && (
    <details className={s.method}>
      <summary>How this is computed</summary>
      <div className={s.methodBody}>
        <p>{method.summary}</p>
        {method.steps?.length ? (<><span className={s.methodLabel}>Steps</span><ul>{method.steps.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
        {method.inputs?.length ? (<><span className={s.methodLabel}>Inputs</span><ul>{method.inputs.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
        {method.caveats?.length ? (<><span className={s.methodLabel}>Caveats</span><ul>{method.caveats.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
      </div>
    </details>
  );

  const cls = [s.section, dense && s.dense, className].filter(Boolean).join(" ");

  if (collapsible) {
    return (
      <details ref={rootRef as RefObject<HTMLDetailsElement>} id={id} data-section-id={id} className={cls + " " + s.collapsible} open={defaultOpen}>
        <summary>{head}</summary>
        {methodEl}
        <div ref={ref} className={s.body}>{children}</div>
      </details>
    );
  }
  return (
    <section ref={rootRef} id={id} data-section-id={id} className={cls}>
      {head}
      {methodEl}
      <div ref={ref} className={s.body}>{children}</div>
    </section>
  );
}
