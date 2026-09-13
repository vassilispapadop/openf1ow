// Practice, in the five-tab shape: the run plan and long runs carry the
// strategy story, best laps the single-lap one, each with its fuel caveat.

import type { ViewKey } from "../../lib/constants";
import { C, sty } from "../../lib/styles";
import ModelGate from "../insights/ModelGate";
import AnalysisTabBar from "../shell/AnalysisTabBar";
import Verdicts, { KpiRow } from "../insights/Verdicts";
import TopSpeedsCard from "../insights/TopSpeedsCard";
import SuperClipping from "../analysis/SuperClipping";
import {
  BestLapsCard, SectorBestsCard, SessionEvolutionCard, TrackEvolutionCard, RunPlanCard, LongRunsCard, CompoundProgramCard,
  TeammateSingleLapCard, HeadlineLapTrackCards, sessionIntro,
} from "../insights/SingleLapCards";

export default function PracticeAnalysis({ sessionKey, sessionName, subTab, onSubTabChange }: {
  sessionKey: string;
  sessionName?: string;
  subTab: ViewKey;
  onSubTabChange: (tab: ViewKey) => void;
}) {
  return (
    <ModelGate loading="Loading practice laps…">
      {model => (
        <div>
          <KpiRow onOpenTab={onSubTabChange} />
          <AnalysisTabBar value={subTab} onChange={onSubTabChange} />

          {subTab === "overview" && (
            <>
              <section style={{ ...sty.card, background: "rgba(255,255,255,0.02)" }}>
                <h3 style={sty.sectionHead}>{sessionName || model.info.session_name || "Practice"}</h3>
                <p style={{ fontSize: 12, color: C.textMute, margin: "8px 0 0", lineHeight: 1.6, maxWidth: 760 }}>{sessionIntro(model)}</p>
              </section>
              <Verdicts onOpenTab={onSubTabChange} />
              <BestLapsCard />
              <LongRunsCard />
            </>
          )}

          {subTab === "pace" && (
            <>
              <Verdicts area="pace" onOpenTab={onSubTabChange} />
              <BestLapsCard />
              <SectorBestsCard />
              <TopSpeedsCard />
              <SessionEvolutionCard />
            </>
          )}

          {subTab === "strategy" && (
            <>
              <Verdicts area="strategy" onOpenTab={onSubTabChange} />
              <LongRunsCard />
              <RunPlanCard />
              <CompoundProgramCard />
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
              <SuperClipping sessionKey={sessionKey} allLaps={model.laps} drivers={model.drivers.map(d => d.driver)} />
            </>
          )}
        </div>
      )}
    </ModelGate>
  );
}
