import { describe, it, expect } from "vitest";
import { buildNeutralisations } from "../session/neutralisations.ts";
import type { RaceControlMsg } from "../types/raw.ts";

const T0 = Date.UTC(2026, 9, 4, 8, 33, 0);
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const msg = (sec: number, category: string, message: string, lap: number, flag: string | null = null): RaceControlMsg =>
  ({ date: at(sec), category, flag, scope: flag ? "Track" : null, sector: null, lap_number: lap, driver_number: null, message });

// Leader lap starts: a 101 s race pace, with the first two laps long.
const LAP_STARTS = [0, 162, 394, 534, 661, 783, 901, 1016, 1128];   // L1..L9
const leaderLaps = LAP_STARTS.map((s, i) => ({ lap: i + 1, tStart: T0 + s * 1000 }));

describe("buildNeutralisations", () => {
  it("reads a start behind the safety car that goes to a standing start (Kuala Lumpur 2026 shape)", () => {
    const rc = [
      msg(-300, "Other", "SAFETY CAR LIGHTS ON", 1),
      msg(0, "SessionStatus", "SESSION STARTED", 1),
      msg(217, "Other", "STANDING START", 2),
      msg(1130, "SafetyCar", "SAFETY CAR DEPLOYED", 9),
    ];
    const out = buildNeutralisations(rc, leaderLaps, T0 + 6000 * 1000);
    expect(out.map(n => n.kind)).toEqual(["SC", "SC"]);
    const start = out[0];
    expect(start.standingRestart).toBe(true);
    // Closes when the leader starts lap 3 — the lap the race proper begins on.
    expect(start.tEnd).toBe(T0 + 394 * 1000);
    expect(start.lapStart).toBe(1);
    expect(start.lapEnd).toBe(3);
    // The later, normal deployment is its own window.
    expect(out[1].standingRestart).toBeUndefined();
    expect(out[1].tStart).toBe(T0 + 1130 * 1000);
  });

  it("treats DEPLOYED after LIGHTS ON as the same safety car and LIGHTS OFF as the release", () => {
    const rc = [
      msg(-100, "Other", "SAFETY CAR LIGHTS ON", 1),
      msg(10, "SafetyCar", "SAFETY CAR DEPLOYED", 1),
      msg(300, "Other", "SAFETY CAR LIGHTS OFF", 2),
    ];
    const out = buildNeutralisations(rc, leaderLaps, null);
    expect(out).toHaveLength(1);
    expect(out[0].messages).toHaveLength(3);
    expect(out[0].tEnd).toBe(T0 + 394 * 1000);
    expect(out[0].standingRestart).toBeUndefined();
  });

  it("ignores a LIGHTS OFF echo after IN THIS LAP", () => {
    const rc = [
      msg(600, "SafetyCar", "SAFETY CAR DEPLOYED", 5),
      msg(800, "SafetyCar", "SAFETY CAR IN THIS LAP", 6),
      msg(840, "Other", "SAFETY CAR LIGHTS OFF", 6),
    ];
    const out = buildNeutralisations(rc, leaderLaps, null);
    expect(out).toHaveLength(1);
    expect(out[0].tEnd).toBe(T0 + 901 * 1000);
  });
});
