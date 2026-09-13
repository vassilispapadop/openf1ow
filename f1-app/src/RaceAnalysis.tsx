// The race page: five tabs, each reading verdicts for that tab first, then
// the evidence. Every card is an engine card over the shared SessionModel;
// this file only decides which cards a tab shows.

import AIAnalysis from "./components/AIAnalysis";
import RaceReplay from "./components/RaceReplay";
import type { Driver, Lap, Weather } from "./lib/types";
import { sty } from "./lib/styles";
import type { ViewKey } from "./lib/constants";
import Pill from "./components/Pill";
import WeatherCorrelation from "./components/analysis/WeatherCorrelation";
import SuperClipping from "./components/analysis/SuperClipping";
import AnalysisTabBar from "./components/shell/AnalysisTabBar";
import { Section } from "./ui";
import ModelGate from "./components/insights/ModelGate";
import { buildFacts } from "./engine/index.ts";
import Verdicts, { KpiRow } from "./components/insights/Verdicts";
import TruePaceCard from "./components/insights/TruePaceCard";
import DeltaTraceCard from "./components/insights/DeltaTraceCard";
import LapEvolutionCard from "./components/insights/LapEvolutionCard";
import { SectorsCard, ConsistencyCard } from "./components/insights/PaceCards";
import { StrategyTimelineCard, UndercutCard, TyreLifeCard, PitCrewCard } from "./components/insights/StrategyCards";
import { DegradationCard, CompoundsCard, FuelCard } from "./components/insights/TyreCards";
import { TeammatesCard, OvertakesCard, SCImpactCard, DirtyAirCard } from "./components/insights/BattlesCards";
import ConstructorsCard from "./components/insights/ConstructorsCard";
import WhatIfCard from "./components/insights/WhatIfCard";
import { StartCard, GridFinishCard } from "./components/insights/OverviewCards";

export default function RaceAnalysis({ sessionKey, drivers, weather, raceControl = [], results = [], raceMeta, subTab, onSubTabChange }: {
  sessionKey: string;
  drivers: Driver[];
  weather: Weather[];
  raceControl?: any[];
  results?: any[];
  raceMeta?: { meetingName?: string; circuit?: string; country?: string; year?: number; sessionName?: string };
  subTab: ViewKey;
  onSubTabChange: (tab: ViewKey) => void;
}) {
  return (
    <ModelGate>
      {model => {
        // The two remaining telemetry/weather cards take raw laps; an
        // EnrichedLap is a Lap, so they read straight off the model.
        const allLaps: Lap[] = model.laps;
        const exportJson = () => {
          // The same facts the verdicts and the AI narrative are built from.
          const facts = buildFacts(model);
          const blob = new Blob([JSON.stringify(facts, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "race-analysis-" + sessionKey + ".json";
          a.click();
          URL.revokeObjectURL(url);
        };
        return (
          <div>
            <KpiRow onOpenTab={onSubTabChange} />
            <AnalysisTabBar value={subTab} onChange={onSubTabChange} actions={(
              <Pill size="sm" onClick={exportJson} title="Download race analysis data as JSON">Export JSON</Pill>
            )} />

            {subTab === "overview" && (
              <>
                <Verdicts onOpenTab={onSubTabChange} />
                <StartCard />
                <GridFinishCard />
                <AIAnalysis key={sessionKey} allLaps={allLaps} drivers={drivers} stints={[]} pits={[]} weather={weather} raceControl={raceControl} results={results} raceMeta={raceMeta} />
              </>
            )}

            {subTab === "pace" && (
              <>
                <Verdicts area="pace" onOpenTab={onSubTabChange} />
                <TruePaceCard />
                <LapEvolutionCard />
                <DeltaTraceCard />
                <SectorsCard />
                <ConsistencyCard />
              </>
            )}

            {subTab === "strategy" && (
              <>
                <Verdicts area="strategy" onOpenTab={onSubTabChange} />
                <StrategyTimelineCard />
                <UndercutCard />
                <WhatIfCard />
                <TyreLifeCard />
                <DegradationCard />
                <CompoundsCard />
                <FuelCard />
                <PitCrewCard />
              </>
            )}

            {subTab === "battles" && (
              <>
                <Verdicts area="battles" onOpenTab={onSubTabChange} />
                <TeammatesCard />
                <OvertakesCard />
                <SCImpactCard />
                <ConstructorsCard />
                <DirtyAirCard />
              </>
            )}

            {subTab === "track" && (
              <>
                <Verdicts area="track" onOpenTab={onSubTabChange} />
                <Section
                  id="weather"
                  title="Weather and lap time"
                  hint="Did the track temperature move the field? Lap times against the weather feed, and which drivers coped best with shifting conditions."
                >
                  <WeatherCorrelation allLaps={allLaps} drivers={drivers} weather={weather} />
                </Section>
                <SuperClipping sessionKey={sessionKey} allLaps={allLaps} drivers={drivers} />
                <div style={sty.card}>
                  <RaceReplay sessionKey={sessionKey} drivers={drivers} />
                </div>
              </>
            )}
          </div>
        );
      }}
    </ModelGate>
  );
}
