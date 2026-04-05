import { F, M } from "../../lib/styles";

export default function Footer() {
  return (
    <div style={{ position: "relative", marginTop: 60 }}>
      {/* Racing stripe */}
      <div style={{
        height: 1,
        background: "linear-gradient(90deg, transparent, rgba(225,6,0,0.2) 30%, rgba(225,6,0,0.2) 70%, transparent)",
      }} />
      <div style={{
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: F }}>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>Open</span>
            <span style={{ color: "rgba(225,6,0,0.35)" }}>F1</span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>ow</span>
          </span>
          <div style={{
            fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.15)", letterSpacing: "1.2px",
            textTransform: "uppercase" as const, padding: "4px 10px",
            border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, fontFamily: M,
          }}>OpenF1 API</div>
        </div>
        <div style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.1)",
          fontFamily: M,
          display: "flex",
          alignItems: "center",
          gap: 12,
          letterSpacing: "0.5px",
        }}>
          <span>Powered by OpenF1 API</span>
          <span style={{ color: "rgba(225,6,0,0.15)" }}>{"\u2022"}</span>
          <span>Not affiliated with Formula 1</span>
        </div>
      </div>
    </div>
  );
}
