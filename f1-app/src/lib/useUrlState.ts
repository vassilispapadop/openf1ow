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

export function readParams(): UrlParams {
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

export function useUrlState(onPop: (p: UrlParams) => void) {
  const popRef = useRef(onPop);
  popRef.current = onPop;

  // Track whether we're handling a popstate event
  const handlingPop = useRef(false);

  const pushState = useCallback((params: UrlParams) => {
    if (handlingPop.current) return;
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

  const markPopState = useCallback(() => {
    handlingPop.current = true;
  }, []);

  const clearPopState = useCallback(() => {
    handlingPop.current = false;
  }, []);

  useEffect(() => {
    const handler = () => {
      popRef.current(readParams());
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { pushState, replaceState, markPopState, clearPopState };
}
