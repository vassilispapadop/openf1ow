// The page's opening strip: a handful of headline numbers, each linking to the
// chart that backs it. Cards are skipped when the artifact lacks the data.

import { useMemo } from "react";
import type { SeasonTrends } from "../../lib/seasonUtils";
import { seasonHighlights } from "../../lib/seasonHighlights";
import { TEAM_COLORS, TEAM_FALLBACK_COLORS } from "../../lib/constants";
import { readableOnDark } from "../../lib/teamColor";
import { Panel } from "../../ui";
import { F, M } from "../../lib/styles";
import css from "./SeasonSummary.module.css";

export default function SeasonSummary({ trends }: { trends: SeasonTrends }) {
  const cards = useMemo(() => seasonHighlights(trends), [trends]);
  if (!cards.length) return null;
  return (
    <div className={css.strip} style={{ fontFamily: F }} role="list" aria-label="Season headlines">
      {cards.map((c, i) => {
        const color = TEAM_COLORS[c.team] ?? TEAM_FALLBACK_COLORS[i % TEAM_FALLBACK_COLORS.length];
        return (
          <a key={c.id} href={c.href} className={css.link} role="listitem">
            <Panel accent={color} className={css.card}>
              <div className={css.label}>{c.label}</div>
              <div className={css.team} style={{ color: readableOnDark(color) }}>{c.team}</div>
              <div className={css.value} style={{ fontFamily: M, color: c.tone === "neg" ? "var(--neg)" : c.tone === "pos" ? "var(--pos)" : "var(--text)" }}>{c.value}</div>
              <div className={css.caption}>{c.caption}</div>
            </Panel>
          </a>
        );
      })}
    </div>
  );
}
