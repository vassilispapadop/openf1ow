import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DEFAULT_YEAR, DEFAULT_ANALYSIS_TAB, DEFAULT_DRIVER_TAB, ANALYSIS_VIEWS, TAB_REDIRECT, paths, type ViewKey,
} from "../lib/constants";

const VIEW_KEYS = new Set<string>(ANALYSIS_VIEWS.map(v => v.key));

/** Legacy `?subTab=` values were the old tab slugs; map them onto a live view
 *  (or the default) rather than emitting a path the router can't serve. */
function toViewKey(raw: string | null): ViewKey {
  if (!raw) return DEFAULT_ANALYSIS_TAB;
  if (VIEW_KEYS.has(raw)) return raw as ViewKey;
  return TAB_REDIRECT[raw] ?? DEFAULT_ANALYSIS_TAB;
}

export default function LegacyRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const mk = sp.get("mk");
    if (!mk) return;

    const year = Number(sp.get("year")) || DEFAULT_YEAR;
    const sk = sp.get("sk");
    const dn = sp.get("dn");
    const view = sp.get("view");
    const subTab = toViewKey(sp.get("subTab"));
    const tab = sp.get("tab") || DEFAULT_DRIVER_TAB;

    if (sk) {
      if (view === "driver" && dn) {
        navigate(paths.driver(year, mk, sk, dn, tab), { replace: true });
      } else {
        navigate(paths.analysis(year, mk, sk, subTab), { replace: true });
      }
    } else {
      navigate(paths.meeting(year, mk), { replace: true });
    }
  }, [location.search, navigate]);

  return null;
}
