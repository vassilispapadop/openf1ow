import { sty } from "../../lib/styles";

interface RaceControlTabProps {
  rc: any[];
}

/* --- helper: flag badge color --- */
const flagColor = (flag: string | null | undefined): string => {
  if (!flag) return "rgba(60,60,80,0.6)";
  if (flag === "GREEN") return "#166534";
  if (flag.includes("YELLOW")) return "#854d0e";
  if (flag === "RED") return "#991b1b";
  if (flag === "BLUE") return "#1e40af";
  if (flag === "BLACK AND WHITE") return "#444";
  return "#444";
};

/* --- helper: flag left border color --- */
const flagBorderColor = (flag: string | null | undefined, category: string | null | undefined): string => {
  if (!flag && !category) return "rgba(255,255,255,0.04)";
  if (flag === "GREEN") return "#22c55e";
  if (flag === "YELLOW" || flag === "DOUBLE YELLOW") return "#eab308";
  if (flag === "RED") return "#ef4444";
  if (flag === "BLUE") return "#3b82f6";
  if (category === "SafetyCar") return "#f97316";
  return "rgba(255,255,255,0.06)";
};

export default function RaceControlTab({ rc }: RaceControlTabProps) {
  return (
    <div style={sty.card}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <span style={{
          ...sty.sectionHead,
        }}>Race Control</span>
        <span style={{
          fontSize: 10,
          color: "#5a5a6e",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
        }}>{rc.length} messages</span>
      </div>
      {!rc.length ? <div style={{ color: "#5a5a6e", fontSize: 13 }}>No messages</div> : (
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {rc.map((r, i) => (
            <div key={i} style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              borderLeft: "3px solid " + flagBorderColor(r.flag, r.category),
              marginBottom: 2,
              borderRadius: "0 6px 6px 0",
              background: "rgba(255,255,255,0.01)",
              transition: "background 0.15s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10,
                  color: "#5a5a6e",
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}>{(r.date || "").split("T")[1]?.substring(0, 8)}</span>
                {r.flag && (
                  <span style={{
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    color: "#fff",
                    background: flagColor(r.flag),
                    letterSpacing: "0.3px",
                    textTransform: "uppercase" as const,
                  }}>{r.flag}</span>
                )}
                <span style={{
                  fontSize: 9,
                  color: "#5a5a6e",
                  background: "rgba(255,255,255,0.04)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontWeight: 500,
                }}>{r.category}</span>
              </div>
              <div style={{ fontSize: 12, color: "#b0b0c0", lineHeight: 1.4 }}>{r.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
