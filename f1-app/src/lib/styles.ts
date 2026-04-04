export const F = "'Inter','SF Pro Display',system-ui,sans-serif";
export const M = "'JetBrains Mono','SF Mono','Cascadia Code','Consolas',monospace";

export const sty = {
  card: {
    background: "rgba(12, 12, 24, 0.8)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.05)",
    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
  },
  th: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    color: "#4a4a62",
    textAlign: "left" as const,
    position: "sticky" as const,
    top: 0,
    background: "rgba(12, 12, 24, 0.98)",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    fontFamily: F,
    backdropFilter: "blur(12px)",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.025)",
    transition: "background 0.15s ease",
  },
  mono: { fontFamily: M },
  sectionHead: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "1.2px",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#4a4a62",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    marginBottom: 4,
  },
};
