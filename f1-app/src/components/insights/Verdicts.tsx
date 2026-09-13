// The engineer's debrief: the engine's verdicts as cards, most important
// first, each with its numbers, a confidence and a link to the evidence.
// On the overview every area shows; on another tab only that tab's.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionModel } from "../../lib/useSessionModel";
import { generateVerdicts, type Verdict, type VerdictArea } from "../../engine/index.ts";
import { Section, Badge, StatTile, Segmented } from "../../ui";
import { C, F } from "../../lib/styles";
import { podiumColor } from "../../lib/format";
import type { ViewKey } from "../../lib/constants";

const AREA_LABEL: Record<VerdictArea, string> = { overview: "Race", pace: "Pace", strategy: "Strategy", battles: "Battles", track: "Track" };
const CONF_TONE = { high: "pos", medium: "warn", low: "mute" } as const;

export function useVerdicts(): Verdict[] {
  const { model } = useSessionModel();
  return useMemo(() => (model ? generateVerdicts(model) : []), [model]);
}

/** The four headline tiles, derived from the same verdicts. */
export function KpiRow({ onOpenTab }: { onOpenTab?: (tab: ViewKey) => void }) {
  const verdicts = useVerdicts();
  const { model } = useSessionModel();
  const by = (id: string) => verdicts.find(v => v.id === id);
  const teamColor = (v?: Verdict) => {
    const dn = v?.drivers?.[0];
    const d = dn != null ? model?.byDriver[dn] : null;
    return d ? "#" + (d.driver.team_colour || "666") : undefined;
  };
  const acr = (v?: Verdict) => { const dn = v?.drivers?.[0]; return dn != null ? model?.byDriver[dn]?.driver.name_acronym ?? "—" : "—"; };
  const winner = by("race_winner"), fl = by("fastest_lap"), tyre = by("best_tyre_management"), over = by("overperformer");
  const tiles = [
    winner && { key: "winner", label: "Winner", accent: podiumColor(0), team: teamColor(winner), value: acr(winner), sub: winner.numbers.find(n => n.label === "Margin") ? `Margin ${winner.numbers.find(n => n.label === "Margin")!.value}` : "Race winner", tab: "overview" as ViewKey },
    fl && { key: "fastest", label: "Fastest lap", accent: C.violet, team: teamColor(fl), value: acr(fl), sub: fl.numbers.find(n => n.label === "Time")?.value ?? "", tab: "pace" as ViewKey },
    tyre && { key: "tyre", label: "Tyre master", accent: C.pos, team: teamColor(tyre), value: acr(tyre), sub: tyre.numbers.find(n => n.label === "Deg")?.value ?? "", tab: "strategy" as ViewKey },
    over && { key: "over", label: "Overperformer", accent: C.warn, team: teamColor(over), value: acr(over), sub: `${over.numbers.find(n => n.label === "Finish")?.value} from ${over.numbers.find(n => n.label === "Pace rank")?.value} pace`, tab: "overview" as ViewKey },
  ].filter(Boolean) as { key: string; label: string; accent: string; team?: string; value: string; sub: string; tab: ViewKey }[];
  if (!tiles.length) return null;
  return (
    <div id="kpis" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      {tiles.map(t => (
        <StatTile key={t.key} grow label={t.label} accent={t.accent} teamColor={t.team} value={t.value} sub={t.sub} onClick={onOpenTab ? () => onOpenTab(t.tab) : undefined} />
      ))}
    </div>
  );
}

export default function Verdicts({ area, limit, onOpenTab }: { area?: VerdictArea; limit?: number; onOpenTab?: (tab: ViewKey) => void }) {
  const verdicts = useVerdicts();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<VerdictArea | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const shown = useMemo(() => {
    let v = area ? verdicts.filter(x => x.area === area) : verdicts;
    if (!area && filter !== "all") v = v.filter(x => x.area === filter);
    v = v.filter(x => x.id !== "data_quality" || !area);
    return limit ? v.slice(0, limit) : v;
  }, [verdicts, area, filter, limit]);
  if (!shown.length) return null;

  const areas = Array.from(new Set(verdicts.map(v => v.area))) as VerdictArea[];
  const openEvidence = (v: Verdict) => {
    if (onOpenTab) onOpenTab(v.evidence.tab as ViewKey);
    // Section flashes on #hash; set after the tab has mounted.
    setTimeout(() => {
      window.location.hash = v.evidence.sectionId;
      document.getElementById(v.evidence.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    void navigate;
  };

  return (
    <Section
      id="verdicts"
      kicker={area ? `${AREA_LABEL[area]} verdicts` : "Verdicts"}
      title={area ? "What the numbers say here" : "Engineer's debrief"}
      hint={area ? undefined : "The findings that matter, most important first. Each one names its method and its sample; click through to the evidence."}
      actions={!area && areas.length > 1 ? (
        <Segmented size="sm" role="radiogroup" ariaLabel="Verdict area" value={filter} onChange={setFilter}
          options={[{ key: "all", label: "All" }, ...areas.map(a => ({ key: a, label: AREA_LABEL[a] }))]} />
      ) : undefined}
      dense={!!area}
    >
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: area ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {shown.map(v => {
          const open = expanded === v.id;
          return (
            <article key={v.id} style={{
              border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px", background: C.surfaceAlt, fontFamily: F,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: 1.4, flex: 1 }}>{v.headline}</p>
                <Badge tone={CONF_TONE[v.confidence]} size="sm" title={`${v.confidence} confidence`}>{v.confidence}</Badge>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                {v.numbers.map(n => (
                  <span key={n.label} style={{ fontSize: 11, color: C.textMute }}>
                    {n.label} <span style={{ color: C.text, fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" }}>{n.value}</span>
                  </span>
                ))}
              </div>
              {open && <p style={{ margin: 0, fontSize: 12, color: C.textDim, lineHeight: 1.55 }}>{v.detail}</p>}
              <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                <button type="button" onClick={() => setExpanded(open ? null : v.id)} style={linkBtn}>{open ? "Less" : "How"}</button>
                <button type="button" onClick={() => openEvidence(v)} style={linkBtn}>Evidence → {AREA_LABEL[v.evidence.tab]}</button>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: C.textDim, cursor: "pointer", fontFamily: F, fontSize: 11, fontWeight: 600,
};
