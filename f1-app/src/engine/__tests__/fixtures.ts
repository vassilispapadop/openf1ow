// Loads recorded sessions from src/engine/__fixtures__/<slug>/ (see
// scripts/record-fixture.mjs) into SessionInputs. Tests iterate every fixture
// present so a newly recorded session is covered automatically.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionInputs } from "../types/raw.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__");

function readJson<T>(dir: string, name: string): T | null {
  const p = join(dir, `${name}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}

export interface Fixture {
  slug: string;
  inputs: SessionInputs;
  index: { sessionKey: number; sessionName: string; sessionType: string; counts: Record<string, number> };
}

export function listFixtures(): string[] {
  if (!existsSync(FIXTURES)) return [];
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(FIXTURES, d.name, "session.json")))
    .map(d => d.name)
    .sort();
}

export function loadFixture(slug: string): Fixture {
  const dir = join(FIXTURES, slug);
  const session = readJson<SessionInputs["session"]>(dir, "session");
  if (!session) throw new Error(`fixture ${slug} has no session.json`);
  const arr = <T,>(name: string): T[] => readJson<T[]>(dir, name) ?? [];
  return {
    slug,
    index: readJson(dir, "index") as Fixture["index"],
    inputs: {
      session,
      meeting: readJson(dir, "meeting"),
      drivers: arr("drivers"),
      laps: arr("laps"),
      stints: arr("stints"),
      pits: arr("pit"),
      position: arr("position"),
      intervals: arr("intervals"),
      raceControl: arr("race_control"),
      results: arr("session_result"),
      weather: arr("weather"),
      startingGrid: arr("starting_grid"),
      overtakes: arr("overtakes"),
    },
  };
}

export function loadAllFixtures(): Fixture[] {
  return listFixtures().map(loadFixture);
}
