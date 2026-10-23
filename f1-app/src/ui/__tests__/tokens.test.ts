// src/lib/styles.ts is the token source of truth; src/ui/tokens.css mirrors
// it for CSS Modules. This fails if the two drift.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8");

function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`tokens.css has no --${name}`);
  return m[1].trim().replace(/\s+/g, " ");
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "").replace(/'/g, "");

describe("tokens.css mirrors styles.ts", () => {
  const pairs: [string, string][] = [
    ["bg", 'var(--bg)'], ["surface", 'var(--surface)'], ["surface-alt", 'var(--surface)'Alt], ["surface-hi", 'var(--surface)'Hi],
    ["border", 'var(--border)'], ["border-strong", 'var(--border)'Strong],
    ["text", 'var(--text)'], ["text-dim", 'var(--text)'Dim], ["text-mute", 'var(--text)'Mute], ["text-faint", 'var(--text)'Faint],
    ["accent", 'var(--accent)'], ["accent-dim", 'var(--accent)'Dim],
    ["pos", 'var(--pos)'], ["pos-dim", 'var(--pos)'Dim], ["warn", 'var(--warn)'], ["warn-dim", 'var(--warn)'Dim],
    ["neg", 'var(--neg)'], ["neg-dim", 'var(--neg)'Dim], ["violet", 'var(--violet)'],
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
