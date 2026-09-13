// One selection for the whole page: which drivers are in focus and which one
// is hovered. Every chart dims to it, every table highlights it, and the
// selection lives in the URL (`?d=1,16`) so a shared link reproduces the
// view. Hover is ephemeral and never written to the URL.
//
// Other query params (the driver page's ?cmp, utm tags, legacy ?mk) are
// preserved verbatim; `d` is omitted when nothing is selected.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface Value {
  selected: ReadonlySet<number>;
  hovered: number | null;
  toggle: (driverNumber: number) => void;
  select: (driverNumbers: number[]) => void;
  clear: () => void;
  setHovered: (driverNumber: number | null) => void;
  /** Keys (String(driver_number)) in focus for chart primitives; null when nothing is selected. */
  focusKeys: ReadonlySet<string> | null;
  hoveredKey: string | null;
}

const Ctx = createContext<Value | null>(null);
const PARAM = "d";

function parse(search: string): Set<number> {
  const raw = new URLSearchParams(search).get(PARAM);
  if (!raw) return new Set();
  return new Set(raw.split(",").map(Number).filter(n => Number.isFinite(n) && n > 0));
}

export function SelectionProvider({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(() => parse(location.search));
  const [hovered, setHovered] = useState<number | null>(null);
  const lastKey = useRef(resetKey);

  // A new session clears the selection unless the URL carries one.
  useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      setSelected(parse(location.search));
      setHovered(null);
    }
  }, [resetKey, location.search]);

  // Back/forward: adopt the URL's selection.
  useEffect(() => {
    const fromUrl = parse(location.search);
    const same = fromUrl.size === selected.size && [...fromUrl].every(n => selected.has(n));
    if (!same) setSelected(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const write = useCallback((next: Set<number>) => {
    const sp = new URLSearchParams(window.location.search);
    if (next.size) sp.set(PARAM, [...next].sort((a, b) => a - b).join(",")); else sp.delete(PARAM);
    const search = sp.toString();
    navigate({ pathname: window.location.pathname, search: search ? "?" + search : "", hash: window.location.hash }, { replace: true });
  }, [navigate]);

  const toggle = useCallback((dn: number) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(dn)) n.delete(dn); else n.add(dn); write(n); return n; });
  }, [write]);
  const select = useCallback((dns: number[]) => { const n = new Set(dns); setSelected(n); write(n); }, [write]);
  const clear = useCallback(() => { setSelected(new Set()); write(new Set()); }, [write]);

  const value = useMemo<Value>(() => ({
    selected, hovered, toggle, select, clear, setHovered,
    focusKeys: selected.size ? new Set([...selected].map(String)) : null,
    hoveredKey: hovered != null ? String(hovered) : null,
  }), [selected, hovered, toggle, select, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Selection for cards; a no-op selection outside a provider so cards can
 *  render on pages that don't have one yet. */
export function useSelection(): Value {
  const v = useContext(Ctx);
  return v ?? NOOP;
}

const NOOP: Value = {
  selected: new Set(), hovered: null, toggle: () => {}, select: () => {}, clear: () => {}, setHovered: () => {},
  focusKeys: null, hoveredKey: null,
};
