import { useLocalStorage } from "./useLocalStorage";

// Return-visit hooks. Persisted preferences turn one-off race-day visitors into
// a returning base: a followed-drivers set (personalises the driver grid) and a
// "resume where you left off" pointer to the last race analysis viewed.

const FOLLOW_KEY = "openf1ow:followed-drivers";
const LAST_KEY = "openf1ow:last-race";

export function useFollowedDrivers() {
  const [followed, setFollowed] = useLocalStorage<number[]>(FOLLOW_KEY, []);
  const isFollowed = (dn: number) => followed.includes(dn);
  const toggle = (dn: number) =>
    setFollowed(prev => (prev.includes(dn) ? prev.filter(x => x !== dn) : [...prev, dn]));
  return { followed, isFollowed, toggle };
}

export interface LastRace {
  path: string;
  label: string;
  ts: number;
}

// Written imperatively from the session layout (not via a hook) so it doesn't
// re-render the layout on every navigation. Same key as the read hook below.
export function recordLastRace(r: LastRace) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function useLastRace(): LastRace | null {
  const [last] = useLocalStorage<LastRace | null>(LAST_KEY, null);
  return last;
}
