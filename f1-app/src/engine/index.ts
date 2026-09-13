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
export { bestLapsByDriver, bestLapFor, eligibleForBest, type BestLapRow } from "./analyses/quali.ts";
export { longRuns, compoundPrograms, type LongRun, type CompoundProgram } from "./analyses/practice.ts";
