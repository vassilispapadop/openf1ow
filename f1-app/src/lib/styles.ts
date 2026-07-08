export const F = "'Inter','SF Pro Display',system-ui,sans-serif";
export const M = "'JetBrains Mono','SF Mono','Cascadia Code','Consolas',monospace";

export const C = {
  bg: "#0a0a0d",
  surface: "#131318",
  surfaceAlt: "#1a1a20",
  surfaceHi: "#22222a",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#f4f4f6",
  textDim: "#a0a0ac",
  // Raised from #6a6a74 / #3d3d46: the old values put 9–11px labels below the
  // WCAG-AA 4.5:1 threshold on the dark surfaces (~3.2:1 and ~1.7:1). These
  // clear it for small text while preserving the text > dim > mute > faint
  // hierarchy.
  textMute: "#8a8a94",
  textFaint: "#63636d",
  accent: "#ff1e00",
  accentDim: "rgba(255,30,0,0.12)",
  pos: "#2ed573",
  posDim: "rgba(46,213,115,0.35)",
  posBg: "rgba(46,213,115,0.45)",
  warn: "#ffb547",
  warnDim: "rgba(255,181,71,0.35)",
  neg: "#ff5472",
  negDim: "rgba(255,84,114,0.3)",
  negBar: "rgba(255,84,114,0.35)",
  violet: "#a78bfa",
};

export const R = { sm: 6, md: 10, lg: 14 };

export const sty = {
  bg: {
    fontFamily: F,
    background: C.bg,
    color: C.text,
    minHeight: "100vh",
    padding: 0,
    position: "relative" as const,
  },
  card: {
    background: C.surface,
    borderRadius: R.lg,
    padding: 18,
    marginBottom: 10,
    border: "1px solid " + C.border,
  },
  th: {
    padding: "9px 12px",
    borderBottom: "1px solid " + C.border,
    color: C.textMute,
    textAlign: "left" as const,
    position: "sticky" as const,
    top: 0,
    background: C.surface,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: F,
  },
  td: {
    padding: "9px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    transition: "background 0.15s ease",
  },
  sel: {
    background: C.surfaceAlt,
    color: C.text,
    border: "1px solid " + C.border,
    borderRadius: R.md,
    padding: "10px 34px 10px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: F,
    fontWeight: 500,
    outline: "none",
    transition: "border-color 0.2s ease",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236a6a74'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  },
  mono: { fontFamily: M },
  err: {
    background: "rgba(255,30,0,0.08)",
    border: "1px solid rgba(255,30,0,0.18)",
    padding: "12px 16px",
    borderRadius: R.md,
    marginBottom: 12,
    fontSize: 13,
    color: "#ffb5ab",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sectionHead: {
    fontSize: 14,
    fontWeight: 600,
    color: C.text,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: C.textMute,
    marginBottom: 3,
  },
};
