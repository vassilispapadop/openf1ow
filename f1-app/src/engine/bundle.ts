// The session bundle (GET /api/session/:sk/bundle) mapped onto the engine's
// inputs. Shared by the client provider and the Worker's insights route so
// both build the identical model.

import type { SessionInputs } from "./types/raw.ts";

export interface BundlePayload {
  meta: { sessionKey: number; state: string; generatedAt: string; missing: string[]; partial: boolean; intervals?: string };
  session: SessionInputs["session"];
  meeting?: SessionInputs["meeting"];
  drivers: SessionInputs["drivers"];
  laps: SessionInputs["laps"];
  stints?: unknown[]; pit?: unknown[]; position?: unknown[]; race_control?: unknown[]; session_result?: unknown[];
  weather?: unknown[]; overtakes?: unknown[]; starting_grid?: unknown[]; intervals?: unknown[];
}

export function inputsFromBundle(b: BundlePayload): SessionInputs {
  return {
    session: b.session,
    meeting: b.meeting ?? null,
    drivers: b.drivers ?? [],
    laps: b.laps ?? [],
    stints: (b.stints as SessionInputs["stints"]) ?? null,
    pits: (b.pit as SessionInputs["pits"]) ?? null,
    intervals: (b.intervals as SessionInputs["intervals"]) ?? null,
    position: (b.position as SessionInputs["position"]) ?? null,
    raceControl: (b.race_control as SessionInputs["raceControl"]) ?? null,
    results: (b.session_result as SessionInputs["results"]) ?? null,
    weather: (b.weather as SessionInputs["weather"]) ?? null,
    startingGrid: (b.starting_grid as SessionInputs["startingGrid"]) ?? null,
    overtakes: (b.overtakes as SessionInputs["overtakes"]) ?? null,
  };
}
