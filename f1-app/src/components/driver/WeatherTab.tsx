import { sty } from "../../lib/styles";

interface WeatherTabProps {
  weather: any[];
}

export default function WeatherTab({ weather }: WeatherTabProps) {
  return (
    <div style={sty.card}>
      <div style={{
        ...sty.sectionHead,
        marginBottom: 14,
      }}>Weather</div>
      {!weather.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No data</div> : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8,
          maxHeight: 500,
          overflowY: "auto",
        }}>
          {weather.slice(-30).map((w, i) => (
            <div key={i} style={{
              background: "rgba(20,20,36,0.6)",
              borderRadius: 10,
              padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 10,
                  color: "#5a5a6e",
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}>{(w.date || "").split("T")[1]?.substring(0, 8)}</span>
                <span style={{ fontSize: 16 }}>{w.rainfall ? "\u2601" : "\u2600"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "#5a5a6e" }}>Air</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.air_temperature}{"\u00B0"}C</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "#5a5a6e" }}>Track</span>
                <span style={{ fontWeight: 600, color: "#fbbf24", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.track_temperature}{"\u00B0"}C</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "#5a5a6e" }}>Humidity</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.humidity}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "#5a5a6e" }}>Wind</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.wind_speed} m/s {w.wind_direction != null ? "@ " + w.wind_direction + "\u00B0" : ""}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "#5a5a6e" }}>Pressure</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>{w.pressure} mbar</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
