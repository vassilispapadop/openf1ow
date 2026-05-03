// Corner-by-corner table for a single lap. Detects apexes from car_data
// telemetry (speed local minima) then derives brake-on/off and time-to-
// full-throttle for each.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { sty, C } from "../../lib/styles";
import { rowBg } from "../../lib/format";
import { detectCorners, type TelemetrySample } from "../../lib/cornering";
import Spinner from "../Spinner";

interface Props {
  sessionKey: string;
  driverNumber: number;
  lap: { date_start: string; lap_duration: number; lap_number: number };
}

export default function CornerAnalysis({ sessionKey, driverNumber, lap }: Props) {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lap?.date_start || !lap?.lap_duration) return;
    setLoading(true);
    setError("");
    const start = lap.date_start;
    const end = new Date(new Date(start).getTime() + lap.lap_duration * 1000 + 1000).toISOString();
    const q = `?session_key=${sessionKey}&driver_number=${driverNumber}&date>=${start}&date<=${end}`;
    api(`/car_data${q}`)
      .then((cd: any) => {
        setSamples(cd as TelemetrySample[]);
        setLoading(false);
      })
      .catch(e => { setError(e?.message || "Failed to load"); setLoading(false); });
  }, [sessionKey, driverNumber, lap?.date_start, lap?.lap_duration]);

  const corners = useMemo(() => detectCorners(samples), [samples]);

  if (loading) return <div style={{ padding: 12 }}><Spinner /></div>;
  if (error) return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>Telemetry unavailable: {error}</div>;
  if (!corners.length) return <div style={{ color: C.textMute, fontSize: 12, padding: 12 }}>No corners detected — likely an in/out lap or a circuit configuration we couldn't parse.</div>;

  const slowestApex = corners.reduce((m, c) => Math.min(m, c.apexSpeed), Infinity);
  const longestBrake = corners.reduce((m, c) => Math.max(m, c.brakeDuration), 0);

  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["Corner", "Apex (km/h)", "Δ from peak", "Top before", "Brake (s)", "Throttle on (s)"].map((h, i) => (
              <th key={i} style={{ ...sty.th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {corners.map((c, i) => {
            const isSlowest = c.apexSpeed === slowestApex;
            const isLongestBrake = c.brakeDuration > 0 && c.brakeDuration === longestBrake;
            return (
              <tr key={i} style={rowBg(i)}>
                <td style={{ ...sty.td, fontWeight: 700, color: C.text }}>T{i + 1}</td>
                <td style={{
                  ...sty.td, ...sty.mono, textAlign: "right",
                  color: isSlowest ? C.warn : C.text, fontWeight: isSlowest ? 700 : 600,
                }}>{c.apexSpeed.toFixed(0)}</td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textDim }}>
                  −{c.speedDelta.toFixed(0)}
                </td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textMute }}>
                  {c.topSpeedBefore.toFixed(0)}
                </td>
                <td style={{
                  ...sty.td, ...sty.mono, textAlign: "right",
                  color: isLongestBrake ? C.warn : c.brakeDuration > 0 ? C.text : C.textFaint,
                  fontWeight: isLongestBrake ? 700 : 500,
                }}>
                  {c.brakeDuration > 0 ? c.brakeDuration.toFixed(2) + "s" : "—"}
                </td>
                <td style={{ ...sty.td, ...sty.mono, textAlign: "right", color: C.textDim }}>
                  {c.timeToFullThrottle > 0 ? "+" + c.timeToFullThrottle.toFixed(2) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: C.textMute, margin: "10px 4px 0", lineHeight: 1.5 }}>
        Apexes are local minima in the speed trace. <strong>Δ from peak</strong> is how much speed
        the driver scrubbed entering the corner. <strong>Brake</strong> is the duration the brake
        pedal was pressed (any non-zero application). <strong>Throttle on</strong> is the time from apex
        to ≥90% throttle — a key release-to-power metric.
      </p>
    </div>
  );
}
