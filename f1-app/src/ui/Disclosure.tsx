// A <details> with the site's chrome. Used for methodology notes, "more
// evidence" and anything else that should stay crawlable while folded.

import type { ReactNode } from "react";
import s from "./Disclosure.module.css";

export default function Disclosure({ summary, children, defaultOpen, id, className }: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <details id={id} className={[s.root, className].filter(Boolean).join(" ")} open={defaultOpen}>
      <summary className={s.summary}>{summary}</summary>
      <div className={s.body}>{children}</div>
    </details>
  );
}
