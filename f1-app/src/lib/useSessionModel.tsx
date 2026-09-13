// The one React binding for the analytics engine. Fetches a session's bundle
// (/api/session/:sk/bundle), builds the SessionModel once, and hands it to
// every card on the page. Rate-limited loads (429 during and just after a
// live session) surface as `pending` and retry themselves a few times.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchSessionBundle } from "./api";
import { isRateLimited } from "../components/analysis/PendingData";
import { buildSessionModel, type SessionModel } from "../engine/index.ts";
import { inputsFromBundle } from "../engine/bundle.ts";

export type ModelStatus = "idle" | "loading" | "pending" | "error" | "ready";

export interface BundleMeta {
  sessionKey: number;
  state: string;
  generatedAt: string;
  missing: string[];
  partial: boolean;
}

interface Value {
  model: SessionModel | null;
  meta: BundleMeta | null;
  status: ModelStatus;
  error: string;
  pendingCount: number;
  retry: () => void;
}

const Ctx = createContext<Value | null>(null);

const MAX_AUTO_RETRIES = 4;
const RETRY_MS = 12_000;

export function SessionModelProvider({ sessionKey, children }: { sessionKey: string | number | null | undefined; children: ReactNode }) {
  const [bundle, setBundle] = useState<any | null>(null);
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const loadedFor = useRef<string>("");

  const load = useCallback(async () => {
    if (!sessionKey) return;
    const sk = String(sessionKey);
    setStatus("loading");
    setError("");
    try {
      const b = await fetchSessionBundle(sk);
      if (!b?.session || !b?.laps) throw new Error("Session bundle is incomplete.");
      loadedFor.current = sk;
      setBundle(b);
      setPendingCount(0);
      setStatus("ready");
    } catch (e: any) {
      if (isRateLimited(e)) {
        setPendingCount(c => c + 1);
        setStatus("pending");
      } else {
        setError(e?.message || "Failed to load session data.");
        setStatus("error");
      }
    }
  }, [sessionKey]);

  useEffect(() => {
    const sk = sessionKey ? String(sessionKey) : "";
    if (!sk) { setBundle(null); setStatus("idle"); loadedFor.current = ""; return; }
    if (loadedFor.current === sk) return;
    setBundle(null);
    setPendingCount(0);
    load();
  }, [sessionKey, load]);

  // Auto-retry a rate-limited load a few times, then leave it to the user.
  useEffect(() => {
    if (status !== "pending" || pendingCount === 0 || pendingCount > MAX_AUTO_RETRIES) return;
    const id = setTimeout(load, RETRY_MS);
    return () => clearTimeout(id);
  }, [status, pendingCount, load]);

  const model = useMemo(() => (bundle ? buildSessionModel(inputsFromBundle(bundle)) : null), [bundle]);
  const meta = (bundle?.meta as BundleMeta | undefined) ?? null;

  const retry = useCallback(() => { setPendingCount(0); load(); }, [load]);

  const value = useMemo<Value>(() => ({ model, meta, status, error, pendingCount, retry }), [model, meta, status, error, pendingCount, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionModel(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSessionModel must be used inside a SessionModelProvider");
  return v;
}

/** Memoised analysis over the current model; null until the model is ready. */
export function useAnalysis<T>(fn: (m: SessionModel) => T): T | null {
  const { model } = useSessionModel();
  return useMemo(() => (model ? fn(model) : null), [model, fn]);
}
