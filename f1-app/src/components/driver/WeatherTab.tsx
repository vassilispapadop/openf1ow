// Every weather sample of the session on a time axis — track and air
// temperature as lines, rain as shaded bands — with the full table below.
// Replaces a grid that silently showed only the last 30 samples.

import { useMemo } from "react";
import type { SessionModel, Weather } from "../../engine/index.ts";
import LineChart from "../../charts/LineChart";
import type { Band } from "../../charts/core/Frame";
import { Section, Table, EmptyState, type Column } from "../../ui";
import { C } from "../../lib/styles";

const minuteLabel = (m: number) => `${Math.floor(m)}′`;

export default function WeatherTab({ model }: { model: SessionModel }) {
  const samples = useMemo(() => model.weather.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [model]);
  const origin = useMemo(() => (model.raceStart ?? (samples.length ? new Date(samples[0].date).getTime() : 0)), [model, samples]);
  const minute = (w: Weather) => (new Date(w.date).getTime() - origin) / 60_000;
  const rainBands: Band[] = useMemo(() => {
    const out: Band[] = [];
    let cur: Band | null = null;
    for (const w of samples) {
      const m = minute(w);
      if (w.rainfall === true || w.rainfall === 1) { if (cur) cur.to = m; else cur = { from: m, to: m, color: "rgba(0,114,198,0.16)", label: "rain" }; }
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.map(b => ({ ...b, to: Math.max(b.to, b.from + 1) }));
  }, [samples, origin]);

  const columns: Column<Weather>[] = [
    { key: "t", label: "Time", render: w => (w.date || "").split("T")[1]?.substring(0, 8), mono: true },
    { key: "m", label: "Session", render: w => minuteLabel(minute(w)), mono: true, align: "right", hideBelow: 480 },
    { key: "track", label: "Track °C", render: w => w.track_temperature?.toFixed(1), mono: true, align: "right" },
    { key: "air", label: "Air °C", render: w => w.air_temperature?.toFixed(1), mono: true, align: "right" },
    { key: "hum", label: "Humidity", render: w => Math.round(w.humidity) + " %", mono: true, align: "right", hideBelow: 640 },
    { key: "wind", label: "Wind", render: w => `${w.wind_speed?.toFixed(1)} m/s${w.wind_direction != null ? ` · ${w.wind_direction}°` : ""}`, mono: true, align: "right", hideBelow: 640 },
    { key: "press", label: "Pressure", render: w => Math.round(w.pressure) + " hPa", mono: true, align: "right", hideBelow: 900 },
    { key: "rain", label: "Rain", render: w => (w.rainfall === true || w.rainfall === 1 ? <span style={{ color: "#0072C6", fontWeight: 700 }}>rain</span> : <span style={{ color: C.textFaint }}>—</span>), align: "right" },
  ];
  return (
    <Section
      id="weather"
      title="Weather"
      hint={`Track and air temperature through the session, every sample the feed published (${samples.length}). Shaded bands are rain.`}
      method={{ summary: "Samples from the weather feed, about one a minute, on the session clock (minutes since the first timed lap)." }}
      share={{ meta: "weather", filename: "openf1ow-weather" }}
    >
      {!samples.length ? <EmptyState kind="no-data" what="weather samples" inline={false} /> : (
        <>
          <LineChart
            series={[
              { key: "track", label: "Track", color: "#ffb547", points: samples.map(w => ({ x: minute(w), y: w.track_temperature })) },
              { key: "air", label: "Air", color: "#7dd3fc", points: samples.map(w => ({ x: minute(w), y: w.air_temperature })) },
            ]}
            height={240}
            curve="monotone"
            endDots={false}
            endLabels
            x={{ format: minuteLabel, label: "Session time" }}
            y={{ format: v => Math.round(v) + "°", targetTicks: 5, label: "°C" }}
            bands={rainBands}
            format={v => v.toFixed(1) + " °C"}
            tipTitle={m => `${minuteLabel(m)} into the session`}
            legend={{ compact: true, columns: 2 }}
            rankTooltip={false}
            ariaLabel="Track and air temperature through the session"
          />
          <div style={{ marginTop: 12 }}>
            <Table columns={columns} rows={samples} rowKey={w => w.date} compact maxHeight={360} />
          </div>
        </>
      )}
    </Section>
  );
}
