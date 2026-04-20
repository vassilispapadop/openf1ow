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
  const [loading, setLoading] = useState("");
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
    setLoading("Loading " + year + " races...");
    api("/meetings?year=" + year)
      .then(d => { setMeetings(d); setLoading(""); })
      .catch(e => { setError(e.message); setLoading(""); });
  }, [year, retryCount]);

  useEffect(() => {
    if (!mk) { setSessions([]); setDrivers([]); loadedMk.current = ""; return; }
    if (loadedMk.current === mk) return;
    loadedMk.current = mk;
    setSessions([]);
    setDrivers([]);
    setLoading("Loading sessions...");
    api("/sessions?meeting_key=" + mk)
      .then(d => { setSessions(d); setLoading(""); })
      .catch(e => { setError(e.message); setLoading(""); });
  }, [mk, retryCount]);

  useEffect(() => {
    if (!sk) { setDrivers([]); setWeather([]); setRc([]); setResults([]); loadedSk.current = ""; return; }
    if (loadedSk.current === sk) return;
    loadedSk.current = sk;
    setDrivers([]);
    setLoading("Loading drivers...");
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
      setLoading("");
    }).catch(e => { setError(e.message); setLoading(""); });
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
