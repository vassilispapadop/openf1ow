import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DEFAULT_YEAR, DEFAULT_ANALYSIS_TAB, DEFAULT_DRIVER_TAB, paths } from "../lib/constants";

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
    const subTab = sp.get("subTab") || DEFAULT_ANALYSIS_TAB;
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
