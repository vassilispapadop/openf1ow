import { type ReactNode } from "react";

// Horizontal padding of <main> in SessionLayout. The bar bleeds out to the edges
// of that padding so the blurred backdrop covers content scrolling underneath,
// then re-applies it so the tabs stay aligned with the cards below.
const PAD_X = "clamp(12px, 4vw, 28px)";

/**
 * Pins a page's tab row just below the sticky header. Analysis and driver pages
 * both run long enough (22-row charts, 70-row lap tables) that scrolling back to
 * the top just to change tab was the main navigation cost of the layout.
 *
 * The backdrop is always on rather than toggled on a scroll observer: its tint
 * is the page background colour, so it is invisible until something scrolls
 * underneath it.
 */
export default function StickyTabBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "sticky",
        top: "var(--header-h, 60px)",
        // Below the header (100), above the cards it scrolls over.
        zIndex: 50,
        marginLeft: `calc(-1 * ${PAD_X})`,
        marginRight: `calc(-1 * ${PAD_X})`,
        marginBottom: 16,
        padding: `8px ${PAD_X}`,
        background: "rgba(10,10,13,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {children}
    </div>
  );
}
