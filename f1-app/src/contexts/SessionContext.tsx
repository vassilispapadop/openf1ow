import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { DEFAULT_YEAR } from "../lib/constants";
import type { Driver, Weather } from "../lib/types";

interface SessionContextValue {
  year: number;
  meetings: any[];
  sessions: any[];
  drivers: Driver[];
  mk: string;
  sk: string;
  weather: Weather[];
  rc: any[];
  results: any[];
  loading: string;
  error: string;
  setError: (e: string) => void;
  clearError: () => void;
  retry: () => void;
}

const Ctx = createContext<SessionContextValue>(null!);

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ year?: string; meetingKey?: string; sessionKey?: string }>();

  const year = params.year ? Number(params.year) : DEFAULT_YEAR;
  const mk = params.meetingKey || "";
  const sk = params.sessionKey || "";

  const [meetings, setMeetings] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [weather, setWeather] = useState<Weather[]>([]);
  const [rc, setRc] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  // One flag per fetch. The derived `loading` string stays set until every
  // in-flight request has settled: with a single shared flag, whichever of the
  // three finished first cleared it, so on a deep link the page rendered while
  // the selector bar above it was still waiting for meetings — and shifted the
  // whole page down when it arrived (the main CLS source on session pages).
  const [loadingMeetings, setLoadingMeetings] = useState("");
  const [loadingSessions, setLoadingSessions] = useState("");
  const [loadingDrivers, setLoadingDrivers] = useState("");
  const loading = loadingMeetings || loadingSessions || loadingDrivers;
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const loadedYear = useRef<number>(0);
  const loadedMk = useRef<string>("");
  const loadedSk = useRef<string>("");

  useEffect(() => {
    if (loadedYear.current === year) return;
    loadedYear.current = year;
    setMeetings([]);
    setSessions([]);
    setDrivers([]);
    setLoadingMeetings("Loading " + year + " races...");
    api("/meetings?year=" + year)
      .then(d => { setMeetings(d); setLoadingMeetings(""); })
      .catch(e => { setError(e.message); setLoadingMeetings(""); });
  }, [year, retryCount]);

  useEffect(() => {
    if (!mk) { setSessions([]); setDrivers([]); loadedMk.current = ""; return; }
    if (loadedMk.current === mk) return;
    loadedMk.current = mk;
    setSessions([]);
    setDrivers([]);
    setLoadingSessions("Loading sessions...");
    api("/sessions?meeting_key=" + mk)
      .then(d => { setSessions(d); setLoadingSessions(""); })
      .catch(e => { setError(e.message); setLoadingSessions(""); });
  }, [mk, retryCount]);

  useEffect(() => {
    if (!sk) { setDrivers([]); setWeather([]); setRc([]); setResults([]); loadedSk.current = ""; return; }
    if (loadedSk.current === sk) return;
    loadedSk.current = sk;
    setDrivers([]);
    setLoadingDrivers("Loading drivers...");
    Promise.all([
      api("/drivers?session_key=" + sk),
      api("/weather?session_key=" + sk).catch(() => []),
      api("/race_control?session_key=" + sk).catch(() => []),
      api("/session_result?session_key=" + sk).catch(() => []),
    ]).then(([d, w, r, sr]) => {
      setDrivers((d as Driver[]).sort((a, b) => a.driver_number - b.driver_number));
      setWeather(w as Weather[]);
      setRc(r);
      setResults(sr);
      setLoadingDrivers("");
    }).catch(e => { setError(e.message); setLoadingDrivers(""); });
  }, [sk, retryCount]);

  const clearError = useCallback(() => setError(""), []);

  const retry = useCallback(() => {
    setError("");
    if (sk) loadedSk.current = "";
    else if (mk) loadedMk.current = "";
    else loadedYear.current = 0;
    setRetryCount(c => c + 1);
  }, [sk, mk]);

  const value = useMemo(() => ({
    year, meetings, sessions, drivers, mk, sk,
    weather, rc, results,
    loading, error, setError, clearError, retry,
  }), [year, meetings, sessions, drivers, mk, sk,
       weather, rc, results, loading, error, clearError, retry]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
