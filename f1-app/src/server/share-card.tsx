// Per-race PNG share card. Returns a 1200x630 PNG via Satori + resvg-wasm
// (using the workers-og wrapper, which is the Cloudflare-Workers-compatible
// alternative to @vercel/og — the latter does async I/O at module init and
// trips Workers' "no I/O in global scope" rule).
//
// Endpoint: /share/race/:year/:slug.png  (and a no-extension alias)
//
// Suitable for Twitter/X, Facebook, Slack, Discord, iMessage previews.

/** @jsxImportSource react */

import { ImageResponse, loadGoogleFont } from "workers-og";
import { loadRaceIndex, findRace } from "./recap";
import type { Driver, Lap } from "../lib/types";
import { paceByDriver } from "../lib/raceUtils";
import { ft3 } from "../lib/format";

interface PaceRow { driver: string; team: string; teamColour?: string; medianPace: string; gap: string; }

const W = 1200;
const H = 630;

// ---------------------------------------------------------------------------
// Font loading — cached in module scope so subsequent calls are free.
// workers-og's loadGoogleFont fetches and parses the Google Fonts CSS to
// extract the .woff URL, then returns the binary.
// ---------------------------------------------------------------------------

let fontCache: { bold: ArrayBuffer; semibold: ArrayBuffer } | null = null;

async function loadInter(): Promise<{ bold: ArrayBuffer; semibold: ArrayBuffer } | null> {
  if (fontCache) return fontCache;
  try {
    const [bold, semibold] = await Promise.all([
      loadGoogleFont({ family: "Inter", weight: 800 }),
      loadGoogleFont({ family: "Inter", weight: 600 }),
    ]);
    fontCache = { bold, semibold };
    return fontCache;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data — minimal inline pace ranking (avoids importing the full lib bundle
// into the share path; we only need top 3 for the card).
// ---------------------------------------------------------------------------

interface RaceData {
  raceName: string;
  year: string;
  circuit: string;
  country: string;
  date: string;
  winner: { name: string; team: string } | null;
  topPace: PaceRow[];
}

async function r2Json<T>(F1_DATA: R2Bucket, key: string): Promise<T | null> {
  try {
    const obj = await F1_DATA.get(key);
    if (!obj) return null;
    return (await obj.json()) as T;
  } catch { return null; }
}

async function fetchSession<T>(F1_DATA: R2Bucket, endpoint: string, sk: number): Promise<T | null> {
  const r2 = await r2Json<T>(F1_DATA, `${endpoint}?session_key=${sk}`);
  if (r2) return r2;
  try {
    const res = await fetch(`https://api.openf1.org/v1/${endpoint}?session_key=${sk}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

async function loadRaceData(opts: {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
  origin: string;
  year: string;
  slug: string;
}): Promise<RaceData | null> {
  const idx = await loadRaceIndex(opts.ASSETS, opts.origin);
  if (!idx) return null;
  const race = findRace(idx, opts.year, opts.slug);
  if (!race) return null;

  const raceSk = race.sessions.race;
  let topPace: PaceRow[] = [];
  let winner: RaceData["winner"] = null;

  if (raceSk) {
    const [drivers, laps, results] = await Promise.all([
      fetchSession<Driver[]>(opts.F1_DATA, "drivers", raceSk),
      fetchSession<Lap[]>(opts.F1_DATA, "laps", raceSk),
      fetchSession<{ position?: number; driver_number?: number }[]>(opts.F1_DATA, "session_result", raceSk),
    ]);

    if (drivers && laps) {
      const rows = paceByDriver(laps, drivers).sort((a, b) => a.medianPace - b.medianPace);
      const fastest = rows[0]?.medianPace ?? 0;
      topPace = rows.slice(0, 3).map(r => ({
        driver: r.driver.name_acronym,
        team: r.driver.team_name || "",
        teamColour: r.driver.team_colour,
        medianPace: ft3(r.medianPace),
        gap: r.medianPace === fastest ? "—" : "+" + (r.medianPace - fastest).toFixed(3),
      }));
    }

    if (results && drivers) {
      const w = results.find(r => r.position === 1);
      if (w?.driver_number) {
        const d = drivers.find(dr => dr.driver_number === w.driver_number);
        if (d) winner = { name: d.full_name || d.name_acronym, team: d.team_name || "" };
      }
    }
  }

  return {
    raceName: race.meetingName,
    year: opts.year,
    circuit: race.circuit,
    country: race.country,
    date: race.dateStart,
    winner,
    topPace,
  };
}

// ---------------------------------------------------------------------------
// JSX template
// ---------------------------------------------------------------------------

const ACCENT = "#ff5a4a";
const BG_TOP = "#050508";
const BG_BOT = "#0a0e14";

function teamColour(hex?: string): string {
  if (!hex) return "rgba(255,255,255,0.4)";
  // OpenF1 sometimes returns hex without leading #
  return hex.startsWith("#") ? hex : "#" + hex;
}

function RaceCard({ data }: { data: RaceData }) {
  const dateLabel = data.date
    ? new Date(data.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOT} 100%)`,
        color: "#e8e8ec",
        fontFamily: "Inter, sans-serif",
        position: "relative",
        padding: "0",
      }}
    >
      {/* Top accent bar */}
      <div style={{ width: W, height: 6, background: ACCENT, display: "flex" }} />

      {/* Logo + tag */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "32px 60px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", display: "flex" }}>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>Open</span>
          <span style={{ color: ACCENT }}>F1</span>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>ow</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", display: "flex" }}>
          RACE RECAP
        </div>
      </div>

      {/* Hero block */}
      <div style={{ padding: "30px 60px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", display: "flex" }}>
          {data.year} · {data.circuit.toUpperCase()}, {data.country.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            margin: "10px 0 6px",
            display: "flex",
          }}
        >
          {data.raceName}
        </div>
        {dateLabel && (
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", display: "flex" }}>{dateLabel}</div>
        )}
      </div>

      {/* Bottom: winner + top pace */}
      <div style={{ flex: 1, display: "flex", padding: "30px 60px 30px", gap: 40, alignItems: "stretch" }}>
        {data.winner && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: "0 0 360px",
              borderLeft: `4px solid ${ACCENT}`,
              paddingLeft: 22,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", display: "flex" }}>
              WINNER
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                marginTop: 6,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                display: "flex",
              }}
            >
              {data.winner.name}
            </div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginTop: 4, display: "flex" }}>
              {data.winner.team}
            </div>
          </div>
        )}

        {data.topPace.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 14, display: "flex" }}>
              FASTEST PACE (MEDIAN, CLEAN LAPS)
            </div>
            {data.topPace.map((p, i) => (
              <div
                key={p.driver}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < data.topPace.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.4)",
                    fontVariantNumeric: "tabular-nums",
                    display: "flex",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ width: 4, height: 28, background: teamColour(p.teamColour), borderRadius: 2, marginRight: 16, display: "flex" }} />
                <div style={{ flex: 1, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", display: "flex" }}>
                  {p.driver}
                </div>
                <div style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", marginRight: 18, display: "flex" }}>
                  {p.team}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums", display: "flex" }}>
                  {p.medianPace}
                </div>
                <div
                  style={{
                    width: 80,
                    textAlign: "right",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.4)",
                    fontVariantNumeric: "tabular-nums",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  {p.gap}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom URL bar */}
      <div
        style={{
          padding: "0 60px 26px",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.3)",
          display: "flex",
        }}
      >
        OPENF1OW.COM · OPEN-SOURCE F1 TELEMETRY
      </div>

      {/* Bottom accent bar */}
      <div style={{ width: W, height: 6, background: ACCENT, display: "flex" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level handler
// ---------------------------------------------------------------------------

export async function handleShareRaceRequest(opts: {
  url: URL;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
}): Promise<Response | null> {
  // Accept both /share/race/2024/imola and /share/race/2024/imola.png
  const m = opts.url.pathname.match(/^\/share\/race\/(\d{4})\/([a-z0-9-]+?)(?:\.png)?\/?$/);
  if (!m) return null;
  const [, year, slug] = m;

  const data = await loadRaceData({
    ASSETS: opts.ASSETS,
    F1_DATA: opts.F1_DATA,
    origin: opts.url.origin,
    year,
    slug,
  });
  if (!data) return new Response("Race not found", { status: 404 });

  const fonts = await loadInter();

  return new ImageResponse(<RaceCard data={data} />, {
    width: W,
    height: H,
    headers: {
      // Long edge cache so X/Slack/Discord previews stay fast.
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
    fonts: fonts ? [
      { name: "Inter", data: fonts.semibold, weight: 600, style: "normal" },
      { name: "Inter", data: fonts.bold, weight: 800, style: "normal" },
    ] : undefined,
  });
}

// ===========================================================================
// PER-DRIVER race card
// Endpoint: /share/driver/:year/:slug/:dn(.png)?
// Renders driver final position, team, gap, fastest lap, tyre strategy.
// ===========================================================================

interface DriverData {
  raceName: string;
  year: string;
  driverName: string;
  driverAcronym: string;
  team: string;
  teamColour?: string;
  headshot?: string;
  finalPosition: number | null;
  status: string;
  gapToLeader: string | null;
  fastestLap: string | null;
  fastestLapNumber: number | null;
  stints: { compound: string; lapStart: number; lapEnd: number }[];
  totalRaceLaps: number;
}

// Pirelli compound colours (mirror constants.ts/TC).
const COMPOUND_COLOUR: Record<string, string> = {
  SOFT: "#ff3333",
  MEDIUM: "#ffd700",
  HARD: "#ffffff",
  INTERMEDIATE: "#39b54a",
  WET: "#0072c6",
  UNKNOWN: "rgba(255,255,255,0.3)",
};

function compoundLetter(c: string): string {
  const k = c?.toUpperCase();
  if (k === "SOFT") return "S";
  if (k === "MEDIUM") return "M";
  if (k === "HARD") return "H";
  if (k === "INTERMEDIATE") return "I";
  if (k === "WET") return "W";
  return "?";
}

async function loadDriverData(opts: {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
  origin: string;
  year: string;
  slug: string;
  driverNumber: number;
}): Promise<DriverData | null> {
  const idx = await loadRaceIndex(opts.ASSETS, opts.origin);
  if (!idx) return null;
  const race = findRace(idx, opts.year, opts.slug);
  if (!race) return null;

  const raceSk = race.sessions.race;
  if (!raceSk) return null;

  const [drivers, laps, stints, results] = await Promise.all([
    fetchSession<{ driver_number: number; name_acronym: string; full_name?: string; team_name?: string; team_colour?: string; headshot_url?: string }[]>(opts.F1_DATA, "drivers", raceSk),
    fetchSession<{ driver_number: number; lap_number: number; lap_duration?: number | null; is_pit_out_lap?: boolean }[]>(opts.F1_DATA, "laps", raceSk),
    fetchSession<{ driver_number: number; stint_number: number; compound: string; lap_start: number; lap_end: number }[]>(opts.F1_DATA, "stints", raceSk),
    fetchSession<{ position?: number; driver_number?: number; gap_to_leader?: string | number; status?: string }[]>(opts.F1_DATA, "session_result", raceSk),
  ]);

  const driver = drivers?.find(d => d.driver_number === opts.driverNumber);
  if (!driver) return null;

  // Fastest lap
  let fastestLap: string | null = null;
  let fastestLapNumber: number | null = null;
  if (laps) {
    const driverLaps = laps.filter(l => l.driver_number === opts.driverNumber && l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap);
    if (driverLaps.length) {
      const best = driverLaps.reduce((a, b) => (a.lap_duration! <= b.lap_duration! ? a : b));
      fastestLap = ft3(best.lap_duration!);
      fastestLapNumber = best.lap_number;
    }
  }

  // Result
  const result = results?.find(r => r.driver_number === opts.driverNumber);
  const finalPosition = result?.position ?? null;
  const status = result?.status || "Finished";
  const gapToLeader = result?.gap_to_leader != null
    ? (typeof result.gap_to_leader === "number" ? "+" + result.gap_to_leader.toFixed(3) + "s" : String(result.gap_to_leader))
    : null;

  // Stints (sorted by start lap)
  const driverStints = (stints || [])
    .filter(s => s.driver_number === opts.driverNumber)
    .sort((a, b) => a.lap_start - b.lap_start)
    .map(s => ({ compound: (s.compound || "UNKNOWN").toUpperCase(), lapStart: s.lap_start, lapEnd: s.lap_end }));

  const totalRaceLaps = laps?.length
    ? Math.max(...laps.map(l => l.lap_number), 0)
    : driverStints[driverStints.length - 1]?.lapEnd || 0;

  return {
    raceName: race.meetingName,
    year: opts.year,
    driverName: driver.full_name || driver.name_acronym,
    driverAcronym: driver.name_acronym,
    team: driver.team_name || "",
    teamColour: driver.team_colour,
    headshot: driver.headshot_url,
    finalPosition,
    status,
    gapToLeader,
    fastestLap,
    fastestLapNumber,
    stints: driverStints,
    totalRaceLaps,
  };
}

function DriverCard({ data }: { data: DriverData }) {
  const isDnf = data.status !== "Finished" && !!data.status && data.finalPosition == null;
  const positionLabel = isDnf
    ? data.status.toUpperCase().slice(0, 3)
    : data.finalPosition != null ? "P" + data.finalPosition : "—";
  // Single-digit positions get the largest treatment; double-digit smaller.
  const posFontSize = isDnf ? 110 : (data.finalPosition != null && data.finalPosition <= 9) ? 180 : 130;
  const tColour = teamColour(data.teamColour);

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOT} 100%)`,
        color: "#e8e8ec",
        fontFamily: "Inter, sans-serif",
        position: "relative",
      }}
    >
      {/* Top accent — team colour */}
      <div style={{ width: W, height: 6, background: tColour, display: "flex" }} />

      {/* Logo + tag */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "32px 60px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", display: "flex" }}>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>Open</span>
          <span style={{ color: ACCENT }}>F1</span>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>ow</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", display: "flex" }}>
          DRIVER · {data.year} {data.raceName.toUpperCase()}
        </div>
      </div>

      {/* Main: position + driver block */}
      <div style={{ display: "flex", padding: "30px 60px 0", flex: 1, alignItems: "stretch", gap: 50 }}>
        {/* Big position */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 320,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            paddingRight: 40,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)" }}>
            FINAL
          </span>
          <span
            style={{
              fontSize: posFontSize,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.05em",
              marginTop: 8,
              color: data.finalPosition === 1 ? ACCENT : "#fff",
            }}
          >
            {positionLabel}
          </span>
          {data.gapToLeader && data.finalPosition !== 1 && (
            <span
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.55)",
                marginTop: 12,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {data.gapToLeader} to leader
            </span>
          )}
        </div>

        {/* Driver name + team + fastest lap + stints */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {/* Acronym + name */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ width: 6, height: 50, background: tColour, borderRadius: 3, display: "flex" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em", display: "flex" }}>
                {data.driverAcronym}
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                  marginTop: 4,
                  display: "flex",
                }}
              >
                {data.driverName}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.55)", marginTop: 6, marginLeft: 22, display: "flex" }}>
            {data.team}
          </div>

          {/* Fastest lap */}
          {data.fastestLap && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 26, marginLeft: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", display: "flex" }}>
                FASTEST LAP
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", display: "flex" }}>
                {data.fastestLap}
              </div>
              {data.fastestLapNumber != null && (
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", display: "flex" }}>
                  L{data.fastestLapNumber}
                </div>
              )}
            </div>
          )}

          {/* Tyre strategy bar */}
          {data.stints.length > 0 && data.totalRaceLaps > 0 && (
            <div style={{ marginTop: 22, marginLeft: 22, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 8, display: "flex" }}>
                TYRE STRATEGY
              </div>
              <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", width: 720 }}>
                {data.stints.map((s, i) => {
                  const stintLaps = Math.max(1, s.lapEnd - s.lapStart + 1);
                  const flexBasis = stintLaps;
                  const colour = COMPOUND_COLOUR[s.compound] || COMPOUND_COLOUR.UNKNOWN;
                  return (
                    <div
                      key={i}
                      style={{
                        flex: `${flexBasis} ${flexBasis} 0`,
                        background: colour,
                        color: s.compound === "MEDIUM" || s.compound === "HARD" ? "#000" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {compoundLetter(s.compound)} · {stintLaps}L
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom URL bar */}
      <div
        style={{
          padding: "0 60px 26px",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.3)",
          display: "flex",
        }}
      >
        OPENF1OW.COM · TELEMETRY · STRATEGY · AI ANALYSIS
      </div>

      {/* Bottom accent bar */}
      <div style={{ width: W, height: 6, background: tColour, display: "flex" }} />
    </div>
  );
}

export async function handleShareDriverRequest(opts: {
  url: URL;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  F1_DATA: R2Bucket;
}): Promise<Response | null> {
  // /share/driver/2024/imola/1.png  (or no .png)
  const m = opts.url.pathname.match(/^\/share\/driver\/(\d{4})\/([a-z0-9-]+)\/(\d{1,3})(?:\.png)?\/?$/);
  if (!m) return null;
  const [, year, slug, dn] = m;

  const data = await loadDriverData({
    ASSETS: opts.ASSETS,
    F1_DATA: opts.F1_DATA,
    origin: opts.url.origin,
    year,
    slug,
    driverNumber: Number(dn),
  });
  if (!data) return new Response("Driver not found for this race", { status: 404 });

  const fonts = await loadInter();

  return new ImageResponse(<DriverCard data={data} />, {
    width: W,
    height: H,
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
    fonts: fonts ? [
      { name: "Inter", data: fonts.semibold, weight: 600, style: "normal" },
      { name: "Inter", data: fonts.bold, weight: 800, style: "normal" },
    ] : undefined,
  });
}
