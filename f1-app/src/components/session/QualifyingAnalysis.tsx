// Qualifying, in the same five-tab shape as a race: verdicts first, then the
// evidence for that tab. Everything reads the engine's SessionModel.

import type { ViewKey } from "../../lib/constants";
import { C, sty } from "../../lib/styles";
import ModelGate from "../insights/ModelGate";
import AnalysisTabBar from "../shell/AnalysisTabBar";
import Verdicts, { KpiRow } from "../insights/Verdicts";
import {
  PoleHero, BestLapsCard, SectorBestsCard, SessionEvolutionCard, TrackEvolutionCard, RunPlanCard, StartTyresCard,
  TeammateSingleLapCard, HeadlineLapTrackCards, sessionIntro,
} from "../insights/SingleLapCards";

export default function QualifyingAnalysis({ sessionKey, sessionName, subTab, onSubTabChange }: {
  sessionKey: string;
  sessionName?: string;
  subTab: ViewKey;
  onSubTabChange: (tab: ViewKey) => void;
}) {
  return (
    <ModelGate loading="Loading qualifying laps…">
      {model => (
        <div>
          <KpiRow onOpenTab={onSubTabChange} />
          <AnalysisTabBar value={subTab} onChange={onSubTabChange} />

          {subTab === "overview" && (
            <>
              <section style={{ ...sty.card, background: "rgba(255,255,255,0.02)" }}>
                <h3 style={sty.sectionHead}>{sessionName || model.info.session_name || "Qualifying"}</h3>
                <p style={{ fontSize: 12, color: C.textMute, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 760 }}>{sessionIntro(model)}</p>
              </section>
              <Verdicts onOpenTab={onSubTabChange} />
              <PoleHero label={/sprint/i.test(model.info.session_name || "") ? "Sprint pole" : "Pole"} />
              <BestLapsCard />
            </>
          )}

          {subTab === "pace" && (
            <>
              <Verdicts area="pace" onOpenTab={onSubTabChange} />
              <SectorBestsCard />
              <SessionEvolutionCard />
              <BestLapsCard title="Best laps by segment" />
            </>
          )}

          {subTab === "strategy" && (
            <>
              <Verdicts area="strategy" onOpenTab={onSubTabChange} />
              <StartTyresCard />
              <RunPlanCard />
            </>
          )}

          {subTab === "battles" && (
            <>
              <Verdicts area="battles" onOpenTab={onSubTabChange} />
              <TeammateSingleLapCard />
            </>
          )}

          {subTab === "track" && (
            <>
              <Verdicts area="track" onOpenTab={onSubTabChange} />
              <TrackEvolutionCard />
              <HeadlineLapTrackCards sessionKey={sessionKey} />
            </>
          )}
        </div>
      )}
    </ModelGate>
  );
}
