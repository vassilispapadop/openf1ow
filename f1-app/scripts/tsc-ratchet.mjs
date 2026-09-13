#!/usr/bin/env node
/**
 * Type-check ratchet. The codebase has never been under a working type-check
 * (the root tsconfig is a solution file, so `tsc --noEmit` checked nothing),
 * so it starts with a backlog of errors. Rather than fix them all before any
 * other work can land, this runs `tsc -b`, counts the errors, and:
 *
 *   - FAILS if the count is higher than the committed baseline;
 *   - rewrites the baseline when the count drops, so it only ever moves down.
 *
 * Each phase of the redesign drives its own files to zero. When the baseline
 * reaches 0, swap the build script over to plain `tsc -b` and delete this.
 *
 * Usage:
 *   node scripts/tsc-ratchet.mjs            # check (and lower the baseline)
 *   node scripts/tsc-ratchet.mjs --print    # also list the errors per file
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "tsc-baseline.json");
const print = process.argv.includes("--print");

const run = spawnSync("npx", ["tsc", "-b", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});
const output = (run.stdout || "") + (run.stderr || "");
// The test project type-checks the app tree transitively, so `tsc -b` reports
// an app error once per project that reaches it. Count each distinct error
// (file, position, code, message) once.
const lines = [...new Set(output.split("\n").filter(l => /error TS\d+/.test(l)).map(l => l.trim()))];

const perFile = {};
for (const l of lines) {
  const file = l.replace(/\(\d+,\d+\).*$/, "").trim();
  perFile[file] = (perFile[file] || 0) + 1;
}
const count = lines.length;

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : null;

if (print) {
  for (const [file, n] of Object.entries(perFile).sort((a, b) => b[1] - a[1])) {
    console.log(String(n).padStart(5), file);
  }
}

if (baseline === null) {
  writeFileSync(baselinePath, JSON.stringify({ errors: count, perFile }, null, 2) + "\n");
  console.log(`tsc-ratchet: no baseline yet — recorded ${count} errors.`);
  process.exit(0);
}

if (count > baseline.errors) {
  console.error(`tsc-ratchet: ${count} type errors, baseline is ${baseline.errors}. New errors:`);
  for (const [file, n] of Object.entries(perFile)) {
    const before = baseline.perFile?.[file] || 0;
    if (n > before) console.error(`  +${n - before}  ${file}`);
  }
  console.error("Run `npx tsc -b --pretty false | grep <file>` for the details.");
  process.exit(1);
}

if (count < baseline.errors) {
  writeFileSync(baselinePath, JSON.stringify({ errors: count, perFile }, null, 2) + "\n");
  console.log(`tsc-ratchet: ${count} type errors (down from ${baseline.errors}) — baseline lowered.`);
} else {
  console.log(`tsc-ratchet: ${count} type errors, unchanged.`);
}
