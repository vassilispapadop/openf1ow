/** Time formatter: MM:SS.sss or SS.ssss — nullable-safe */
export function ft(s: number | null | undefined): string {
  if (s == null) return "\u2014";
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(3);
  return m > 0 ? m + ":" + r.padStart(6, "0") : r + "s";
}

/** Time formatter: MM:SS.sss (non-null) */
export function ft3(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(3);
  return m > 0 ? m + ":" + r.padStart(6, "0") : r + "s";
}

/** Time formatter: MM:SS.s (non-null) */
export function ft1(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return m > 0 ? m + ":" + r.padStart(4, "0") : r + "s";
}

/** Time formatter: nullable → dash */
export function ftn(s: number | null): string {
  return s == null ? "\u2014" : ft3(s);
}

/** Speed formatter */
export function fs(s: number | null | undefined): string {
  return s ? s.toFixed(3) : "\u2014";
}

/** Podium position color */
export function podiumColor(rank: number): string {
  if (rank === 0) return "#FFD700";
  if (rank === 1) return "#C0C0C0";
  if (rank === 2) return "#CD7F32";
  return "#e8e8ec";
}

/** Alternating row background */
export function rowBg(i: number): { background: string } {
  return { background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" };
}
