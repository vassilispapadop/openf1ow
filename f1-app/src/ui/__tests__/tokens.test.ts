// src/lib/styles.ts is the token source of truth; src/ui/tokens.css mirrors
// it for CSS Modules. This fails if the two drift.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { C, F, M, R } from "../../lib/styles";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8");

function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`tokens.css has no --${name}`);
  return m[1].trim().replace(/\s+/g, " ");
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "").replace(/'/g, "");

describe("tokens.css mirrors styles.ts", () => {
  const pairs: [string, string][] = [
    ["bg", C.bg], ["surface", C.surface], ["surface-alt", C.surfaceAlt], ["surface-hi", C.surfaceHi],
    ["border", C.border], ["border-strong", C.borderStrong],
    ["text", C.text], ["text-dim", C.textDim], ["text-mute", C.textMute], ["text-faint", C.textFaint],
    ["accent", C.accent], ["accent-dim", C.accentDim],
    ["pos", C.pos], ["pos-dim", C.posDim], ["warn", C.warn], ["warn-dim", C.warnDim],
    ["neg", C.neg], ["neg-dim", C.negDim], ["violet", C.violet],
  ];
  it.each(pairs)("--%s equals C value", (name, value) => {
    expect(norm(cssVar(name))).toBe(norm(value));
  });
  it("font stacks match", () => {
    expect(norm(cssVar("font"))).toBe(norm(F));
    expect(norm(cssVar("mono"))).toBe(norm(M));
  });
  it("radii match", () => {
    expect(cssVar("r-sm")).toBe(`${R.sm}px`);
    expect(cssVar("r-md")).toBe(`${R.md}px`);
    expect(cssVar("r-lg")).toBe(`${R.lg}px`);
  });
});
