// Colour for a lap-comparison trace: the driver's team colour, so a trace is
// recognisable at a glance. A second trace from the same team (a teammate, or
// the same driver's other lap) gets a lighter/darker shade of it instead of a
// clashing hue, so the pair reads as "same team, different car" yet stays
// distinguishable.

import { DRIVER_COLORS } from "./constants";

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function parse(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = ([r, g, b]: number[]) => [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("");

/** Mix toward white (amount > 0) or black (amount < 0); amount in [-1, 1]. */
function shade(rgb: [number, number, number], amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(rgb.map(c => c + (target - c) * t));
}

const luminance = ([r, g, b]: number[]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * @param teamColour  team hex from the session (with or without "#")
 * @param taken       colours (hex, no "#") already used by other comparison traces
 * @param fallbackIndex  used only when the team has no usable colour
 */
export function compareColor(teamColour: string | undefined, taken: readonly string[], fallbackIndex: number): string {
  const rgb = teamColour ? parse(teamColour) : null;
  if (!rgb) return DRIVER_COLORS[fallbackIndex % DRIVER_COLORS.length];
  // Light team colours (e.g. a white livery) can't get much lighter: darken first.
  const steps = luminance(rgb) > 0.6 ? [0, -0.4, -0.65, -0.2] : [0, 0.45, -0.4, 0.7, -0.6];
  const used = new Set(taken.map(c => c.toLowerCase()));
  for (const s of steps) {
    const c = s === 0 ? toHex(rgb) : shade(rgb, s);
    if (!used.has(c)) return c;
  }
  return DRIVER_COLORS[fallbackIndex % DRIVER_COLORS.length];
}
