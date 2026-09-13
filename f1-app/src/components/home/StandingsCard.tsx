// Championship standings after the latest race, from OpenF1's
// championship_drivers / championship_teams feeds (published per race
// meeting). Drivers and teams under one toggle; each row shows the round's
// movement in position and points. When the feed has nothing for the round
// yet the card says so instead of guessing.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { findLatestRace } from "../../lib/latestRace";
import { Section, Segmented, Table, EmptyState, type Column } from "../../ui";
import { C } from "../../lib/styles";
import { podiumColor } from "../../lib/format";

interface DriverRow { driver_number: number; position_current: number | null; position_start: number | null; points_current: number; points_start: number }
interface TeamRow { team_name: string; position_current: number | null; position_start: number | null; points_current: number; points_start: number }
interface DriverInfo { driver_number: number; name_acronym: string; full_name: string; team_name: string; team_colour: string }

type Loaded = { state: "loading" } | { state: "none"; reason: string } | { state: "ok"; drivers: DriverRow[]; teams: TeamRow[]; info: Record<number, DriverInfo>; teamColour: Record<string, string>; round: string };

const signed = (v: number | null, suffix = "") => (v == null || v === 0 ? <span style={{ color: C.textFaint }}>—</span> : <span style={{ color: v > 0 ? C.pos : C.neg }}>{v > 0 ? "+" : ""}{v}{suffix}</span>);

export default function StandingsCard({ year }: { year: number }) {
  const [view, setView] = useState<"drivers" | "teams">("drivers");
  const [data, setData] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await findLatestRace(year);
      if (!latest) { if (!cancelled) setData({ state: "none", reason: "No completed race this season yet." }); return; }
      const mk = latest.meetingKey;
      const [d, t, info, season] = await Promise.all([
        api(`/championship_drivers?meeting_key=${mk}`).catch(() => []) as Promise<DriverRow[]>,
        api(`/championship_teams?meeting_key=${mk}`).catch(() => []) as Promise<TeamRow[]>,
        latest.raceSk ? (api(`/drivers?session_key=${latest.raceSk}`).catch(() => []) as Promise<DriverInfo[]>) : Promise.resolve([] as DriverInfo[]),
        // Drivers who scored earlier in the year but missed the latest race
        // (a reserve, an injury) are named from the season's first race.
        api(`/drivers?meeting_key=${mk}`).catch(() => []) as Promise<DriverInfo[]>,
      ]);
      if (cancelled) return;
      if (!Array.isArray(d) || !d.length) { setData({ state: "none", reason: `Standings after the ${latest.meetingName} have not been published by the data source yet.` }); return; }
      const byDn: Record<number, DriverInfo> = {};
      const teamColour: Record<string, string> = {};
      for (const x of Array.isArray(season) ? season : []) byDn[x.driver_number] ??= x;
      for (const x of info) { byDn[x.driver_number] = x; teamColour[x.team_name] = x.team_colour; }
      setData({ state: "ok", drivers: d, teams: Array.isArray(t) ? t : [], info: byDn, teamColour, round: latest.meetingName });
    })();
    return () => { cancelled = true; };
  }, [year]);

  const driverCols = useMemo<Column<DriverRow>[]>(() => data.state !== "ok" ? [] : [
    { key: "pos", label: "#", render: r => <span style={{ color: podiumColor((r.position_current ?? 99) - 1), fontWeight: 800 }}>{r.position_current ?? "—"}</span>, mono: true, align: "right", width: 40 },
    { key: "driver", label: "Driver", render: r => { const i = data.info[r.driver_number]; return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (i?.team_colour || "666") }} />
        <b>{i?.name_acronym ?? `#${r.driver_number}`}</b>
        <span style={{ color: C.textMute, fontSize: 11 }} className="hide-narrow">{i?.team_name ?? ""}</span>
      </span>
    ); } },
    { key: "pts", label: "Points", render: r => <b>{r.points_current}</b>, mono: true, align: "right", sort: (a, b) => a.points_current - b.points_current },
    { key: "dpts", label: "This round", render: r => signed(r.points_current - r.points_start), mono: true, align: "right", hideBelow: 480, sort: (a, b) => (a.points_current - a.points_start) - (b.points_current - b.points_start) },
    { key: "dpos", label: "Moved", render: r => signed(r.position_start != null && r.position_current != null ? r.position_start - r.position_current : null), mono: true, align: "right", hideBelow: 640 },
  ], [data]);

  const teamCols = useMemo<Column<TeamRow>[]>(() => data.state !== "ok" ? [] : [
    { key: "pos", label: "#", render: r => <span style={{ color: podiumColor((r.position_current ?? 99) - 1), fontWeight: 800 }}>{r.position_current ?? "—"}</span>, mono: true, align: "right", width: 40 },
    { key: "team", label: "Team", render: r => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 3, height: 14, borderRadius: 2, background: "#" + (data.teamColour[r.team_name] || "666") }} /><b>{r.team_name}</b></span> },
    { key: "pts", label: "Points", render: r => <b>{r.points_current}</b>, mono: true, align: "right", sort: (a, b) => a.points_current - b.points_current },
    { key: "dpts", label: "This round", render: r => signed(r.points_current - r.points_start), mono: true, align: "right", hideBelow: 480 },
    { key: "dpos", label: "Moved", render: r => signed(r.position_start != null && r.position_current != null ? r.position_start - r.position_current : null), mono: true, align: "right", hideBelow: 640 },
  ], [data]);

  if (data.state === "loading") return <div style={{ height: 120 }} aria-busy="true" />;

  return (
    <Section
      id="standings"
      kicker={data.state === "ok" ? `After the ${data.round}` : undefined}
      title="Championship standings"
      hint="Points and positions after the latest race, with what each driver and team gained on the round."
      method={{ summary: "OpenF1's championship feeds, published against each race meeting. 'This round' is points after the race minus points before it; 'Moved' is the change in championship position." }}
      actions={data.state === "ok" && data.teams.length ? <Segmented size="sm" role="radiogroup" ariaLabel="Standings" value={view} onChange={setView} options={[{ key: "drivers", label: "Drivers" }, { key: "teams", label: "Teams" }]} /> : undefined}
      dense
    >
      {data.state === "none" ? <EmptyState kind="no-data" what="standings" detail={data.reason} inline={false} /> : view === "drivers" || !data.teams.length
        ? <Table columns={driverCols} rows={data.drivers.slice().sort((a, b) => (a.position_current ?? 99) - (b.position_current ?? 99))} rowKey={r => r.driver_number} compact maxHeight={440} />
        : <Table columns={teamCols} rows={data.teams.slice().sort((a, b) => (a.position_current ?? 99) - (b.position_current ?? 99))} rowKey={r => r.team_name} compact maxHeight={440} />}
    </Section>
  );
}
