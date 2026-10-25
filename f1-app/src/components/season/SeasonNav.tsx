// A sticky row of anchors for the long season page, with the section in view
// highlighted. Only sections that rendered are listed.

import { useEffect, useState } from "react";
import { F } from "../../lib/styles";
import css from "./SeasonNav.module.css";

export interface NavItem { id: string; label: string }

export default function SeasonNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const key = items.map(i => i.id).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      // The first listed section that is mostly on screen wins, so the highlight doesn't flicker between neighbours.
      const hit = items.find(i => (seen.get(i.id) ?? 0) > 0);
      if (hit) setActive(hit.id);
    }, { rootMargin: "-90px 0px -55% 0px", threshold: [0, 0.1, 0.5] });
    for (const i of items) { const el = document.getElementById(i.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length < 3) return null;
  return (
    <nav className={css.nav} style={{ fontFamily: F }} aria-label="Sections on this page">
      {items.map(i => (
        <a
          key={i.id}
          href={"#" + i.id}
          className={[css.chip, active === i.id && css.on].filter(Boolean).join(" ")}
          aria-current={active === i.id ? "true" : undefined}
          onClick={e => {
            const el = document.getElementById(i.id);
            if (!el) return;
            e.preventDefault();
            el.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
            history.replaceState(null, "", "#" + i.id);
            setActive(i.id);
          }}
        >{i.label}</a>
      ))}
    </nav>
  );
}
