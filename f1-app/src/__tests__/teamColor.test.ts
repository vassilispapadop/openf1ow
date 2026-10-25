import { describe, it, expect } from "vitest";
import { readableOnDark, contrastOnDark } from "../lib/teamColor";
import { TEAM_COLORS } from "../lib/constants";

describe("readableOnDark", () => {
  it("lifts a dim team colour to legible contrast and keeps the hash", () => {
    const out = readableOnDark("#1E5BC6");
    expect(out.startsWith("#")).toBe(true);
    expect(contrastOnDark(out)).toBeGreaterThanOrEqual(4.5);
    expect(contrastOnDark("#1E5BC6")).toBeLessThan(4.5);
  });
  it("leaves already-bright colours untouched", () => {
    expect(readableOnDark("#27F4D2").toLowerCase()).toBe("#27f4d2");
  });
  it("makes every 2026 team colour legible", () => {
    for (const hex of Object.values(TEAM_COLORS)) expect(contrastOnDark(readableOnDark(hex))).toBeGreaterThanOrEqual(4.5);
  });
  it("passes through junk", () => { expect(readableOnDark("nope")).toBe("nope"); });
});
