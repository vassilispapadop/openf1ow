import type { CSSProperties } from "react";
import { C, R, F, sty } from "../lib/styles";

// Shimmer placeholder blocks. Replaces the lone centered spinner during
// navigation so the layout keeps its shape instead of collapsing — the page
// switch reads as "content arriving" rather than "screen blanked". The shimmer
// animation is neutralised by the prefers-reduced-motion guard in index.css.
export function SkeletonBlock({
  w = "100%",
  h = 14,
  r = R.sm,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        flexShrink: 0,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.035) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function LoadingLabel({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: F,
        color: C.textMute,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: C.accent,
          animation: "fadeIn 0.8s ease-in-out infinite alternate",
        }}
      />
      {label}
    </div>
  );
}

// Placeholder for the race/driver analysis view: driver strip, view toggle,
// tab bar, a chart card, and a results table — mirroring the real layout.
export function SkeletonAnalysis({ label }: { label?: string }) {
  return (
    <div className="fade-in" aria-busy="true" aria-label={label || "Loading"}>
      <LoadingLabel label={label} />

      {/* Driver strip */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, overflow: "hidden" }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <SkeletonBlock key={i} w={58} h={30} r={999} />
        ))}
      </div>

      {/* Race analysis / Driver view toggle */}
      <SkeletonBlock w={230} h={40} r={999} style={{ marginBottom: 18 }} />

      {/* Sub-tab bar (Overview / Pace / Strategy / Battles / Track) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} w={68} h={26} r={999} />
        ))}
      </div>

      {/* Chart card */}
      <div style={{ ...sty.card, padding: 18 }}>
        <SkeletonBlock w={180} h={15} style={{ marginBottom: 16 }} />
        <SkeletonBlock w="100%" h={280} r={R.md} />
      </div>

      {/* Table card */}
      <div style={{ ...sty.card, padding: 18 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", alignItems: "center" }}>
            <SkeletonBlock w={22} h={12} />
            <SkeletonBlock w={150} h={12} />
            <SkeletonBlock w={60} h={12} style={{ marginLeft: "auto" }} />
            <SkeletonBlock w={60} h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Placeholder for the season dashboard (home): headline card, stat tiles, grid.
export function SkeletonHome() {
  return (
    <div
      className="fade-in"
      aria-busy="true"
      aria-label="Loading season"
      style={{ maxWidth: 980, margin: "12px auto 0", padding: "0 4px" }}
    >
      <SkeletonBlock w={120} h={14} style={{ marginBottom: 16 }} />
      <SkeletonBlock w="100%" h={180} r={R.lg} style={{ marginBottom: 14 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} h={88} r={R.lg} />
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonBlock key={i} h={200} r={R.lg} />
        ))}
      </div>
    </div>
  );
}
