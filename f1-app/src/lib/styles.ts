export const F = "'Inter','SF Pro Display',system-ui,sans-serif";
export const M = "'JetBrains Mono','SF Mono','Cascadia Code','Consolas',monospace";

export const sty = {
  card: {
    background: "rgba(18, 18, 30, 0.7)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    border: "1px solid rgba(255,255,255,0.06)",
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
  },
  th: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    color: "#5a5a6e",
    textAlign: "left" as const,
    position: "sticky" as const,
    top: 0,
    background: "rgba(18, 18, 30, 0.97)",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    fontFamily: F,
    backdropFilter: "blur(12px)",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    transition: "background 0.15s ease",
  },
  mono: { fontFamily: M },
  sectionHead: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: "#5a5a6e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
};
