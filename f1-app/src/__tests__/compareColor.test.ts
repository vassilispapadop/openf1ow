import { describe, it, expect } from "vitest";
import { compareColor } from "../lib/compareColor";

describe("compareColor", () => {
  it("uses the team colour first, with or without #", () => {
    expect(compareColor("27F4D2", [], 0)).toBe("27f4d2");
    expect(compareColor("#27F4D2", [], 0)).toBe("27f4d2");
  });
  it("gives a teammate a different shade", () => {
    const a = compareColor("E80020", [], 0);
    const b = compareColor("E80020", [a], 1);
    expect(b).not.toBe(a);
    expect(compareColor("E80020", [a, b], 2)).not.toBe(b);
  });
  it("darkens very light team colours", () => {
    const a = compareColor("ffffff", [], 0);
    const b = compareColor("ffffff", [a], 1);
    expect(parseInt(b.slice(0, 2), 16)).toBeLessThan(255);
  });
  it("falls back to the palette without a usable colour", () => {
    expect(compareColor(undefined, [], 0)).toMatch(/^[0-9a-f]{6}$/i);
  });
});
