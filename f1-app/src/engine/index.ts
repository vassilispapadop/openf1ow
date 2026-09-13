// Public surface of the analytics engine. Pure TypeScript — no React, no DOM,
// no network — so the app and the offline scripts share one implementation.
// Import with explicit .ts specifiers; Node strips the types natively.

export * from "./types/raw.ts";
export * from "./types/gated.ts";
export * from "./types/model.ts";
export * from "./gates.ts";
export * as stats from "./stats.ts";

export { buildSessionModel } from "./session/build.ts";
export { classifySession, isSprint, SPRINT_LAP_THRESHOLD } from "./session/classify.ts";
export { fuelKgAtLap, fuelCorrect, GP_START_KG, SPRINT_START_KG, DEFAULT_SEC_PER_KG } from "./session/fuel.ts";
export { parseGap } from "./session/intervalsJoin.ts";

export { paceRanking, truePaceRanking, type PaceRow, type PaceRanking } from "./analyses/pace.ts";
export { consistencyByDriver, type ConsistencyRow } from "./analyses/consistency.ts";
export { teammateComparisons, type TeammatePair, type TeamComparison } from "./analyses/teammates.ts";
export { constructorPace, type ConstructorRow, type ConstructorDriverRow } from "./analyses/constructors.ts";
export {
  compoundSummary, driverDegradation, compoundRank, COMPOUND_ORDER,
  type CompoundSummary, type DriverDegRow,
} from "./analyses/degradation.ts";
export { sectorAnalysis, type SectorRow, type SectorAnalysis } from "./analyses/sectors.ts";
export { topSpeeds, type TopSpeeds, type DriverSpeeds, type TeamSpeeds, type SpeedReading } from "./analyses/speeds.ts";
export { bestLapsByDriver, bestLapFor, eligibleForBest, type BestLapRow } from "./analyses/quali.ts";
export { longRuns, compoundPrograms, type LongRun, type CompoundProgram } from "./analyses/practice.ts";
export {
  sessionClock, lapMinute, phaseOf, pushLaps, trackEvolution, sectorBests, teammateSingleLap, runPlan,
  PUSH_LAP_FACTOR, TRACK_EVOLUTION_MIN_LAPS, TRACK_EVOLUTION_MIN_DRIVERS,
  type SessionClock, type SessionPhase, type PushLap, type DriverPushLaps, type TrackEvolution,
  type SectorBests, type SectorBestRow, type SingleLapPair, type PhaseDelta, type DriverRunPlan, type RunSpan,
} from "./analyses/singleLap.ts";

export { pitStopAnalysis, pitLossFor, type PitStopAnalysis, type TeamPitRow } from "./analyses/pitstops.ts";
export { undercutAnalysis, type UndercutAnalysis, type Exchange } from "./analyses/undercut.ts";
export { tyreLife, type TyreLifeCurve, type TyreLifeBin } from "./analyses/tyreLife.ts";
export { strategyTimeline, type StrategyTimeline, type TimelineRow } from "./analyses/strategyTimeline.ts";
export { deltaTrace, type DeltaTrace, type DeltaSeries, type DeltaReference } from "./analyses/deltaTrace.ts";
export { whatIfPitShift, whatIfRange, type WhatIfOptions, type WhatIfResult } from "./analyses/whatIf.ts";
export { startAnalysis, type StartAnalysis, type StartRow } from "./analyses/start.ts";
export { overtakeAnalysis, type OvertakeAnalysis, type ClassifiedOvertake, type OvertakeKind, type DriverOvertakes } from "./analyses/overtakes.ts";
export { neutralisationImpact, type NeutralisationImpact, type ImpactRow } from "./analyses/neutralisationImpact.ts";
export { dirtyAirAnalysis, type DirtyAirAnalysis, type DriverTraffic } from "./analyses/dirtyAir.ts";
export { conversionAnalysis, type ConversionAnalysis, type ConversionRow } from "./analyses/conversion.ts";
export { generateVerdicts, SECTION_IDS, type Verdict, type VerdictArea, type VerdictNumber } from "./verdicts/index.ts";
export { buildFacts, type AnalysisFacts } from "./summary/facts.ts";
