// Team colours are picked for liveries, not for text on a near-black page:
// Red Bull's blue and Ferrari's red read dim at 12 px. readableOnDark lifts a
// colour toward white just far enough to reach a legible contrast against the
// page background, and leaves already-bright colours alone.

const PAGE_BG = [10, 10, 13];   // --bg, #0a0a0d

function parse(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: number[]): number {
  const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastOnDark(hex: string): number {
  const rgb = parse(hex);
  if (!rgb) return 21;
  return (luminance(rgb) + 0.05) / (luminance(PAGE_BG) + 0.05);
}

/** `hex` (with or without #), lightened until it clears `min` contrast on the page. */
export function readableOnDark(hex: string, min = 4.5): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  const hash = hex.startsWith("#") ? "#" : "";
  let mix = 0;
  const at = (m: number) => rgb.map(v => Math.round(v + (255 - v) * m));
  while (mix < 1 && (luminance(at(mix)) + 0.05) / (luminance(PAGE_BG) + 0.05) < min) mix += 0.05;
  return hash + at(mix).map(v => v.toString(16).padStart(2, "0")).join("");
}
