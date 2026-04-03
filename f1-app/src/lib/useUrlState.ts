import { useCallback, useEffect, useRef } from "react";

export interface UrlParams {
  year?: string;
  mk?: string;
  sk?: string;
  dn?: string;
  view?: string;
  tab?: string;
}

const KEYS: (keyof UrlParams)[] = ["year", "mk", "sk", "dn", "view", "tab"];

function readParams(): UrlParams {
  const sp = new URLSearchParams(window.location.search);
  const p: UrlParams = {};
  for (const k of KEYS) {
    const v = sp.get(k);
    if (v) p[k] = v;
  }
  return p;
}

function buildSearch(params: UrlParams): string {
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    if (params[k]) sp.set(k, params[k]!);
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}

export function getInitialParams(): UrlParams {
  return readParams();
}

export function useUrlState() {
  const listenerRef = useRef<((p: UrlParams) => void) | null>(null);

  const pushState = useCallback((params: UrlParams) => {
    const search = buildSearch(params);
    if (window.location.search !== search) {
      window.history.pushState(null, "", search || "/");
    }
  }, []);

  const replaceState = useCallback((params: UrlParams) => {
    const search = buildSearch(params);
    if (window.location.search !== search) {
      window.history.replaceState(null, "", search || "/");
    }
  }, []);

  const onPopState = useCallback((cb: (p: UrlParams) => void) => {
    listenerRef.current = cb;
  }, []);

  useEffect(() => {
    const handler = () => {
      listenerRef.current?.(readParams());
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { pushState, replaceState, onPopState };
}
