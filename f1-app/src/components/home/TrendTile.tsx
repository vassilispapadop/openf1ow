// Home-page trend tile: a StatTile with a sparkline. Kept as a thin adapter
// so the tile callers don't change while the tiles share one look.

import type { ReactNode } from "react";
import { StatTile } from "../../ui";

interface Props {
  label: string;          // e.g. "CONSTRUCTOR PACE"
  headline: string;       // e.g. "McLaren +0.31s"
  detail?: string;        // e.g. "vs. Red Bull, last 5 races"
  delta?: { value: string; positive?: boolean };  // e.g. "+0.04s/race"
  spark?: ReactNode;      // <Sparkline />
  href?: string;
}

export default function TrendTile({ label, headline, detail, delta, spark, href }: Props) {
  return (
    <StatTile
      label={label}
      value={headline}
      sub={detail}
      delta={delta ? { value: delta.value, tone: delta.positive ? "pos" : "neg" } : undefined}
      spark={spark}
      href={href}
    />
  );
}
