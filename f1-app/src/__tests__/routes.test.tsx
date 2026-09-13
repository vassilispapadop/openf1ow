// Route inventory. Every public URL shape the site has ever emitted — the
// sitemap, shared links, OG cards and the Worker's slug redirects all point at
// these — must keep resolving to the same page. This runs each one through the
// real route table, so a refactor that changes a path fails here before it
// ships.

import { describe, it, expect } from "vitest";
import { createRoutesFromElements, matchRoutes, Navigate } from "react-router-dom";
import { appRoutes } from "../App";
import HomePage from "../pages/HomePage";
import AnalysisPage from "../pages/AnalysisPage";
import DriverPage from "../pages/DriverPage";
import SeasonTrendsPage from "../pages/SeasonTrendsPage";
import { ANALYSIS_VIEWS, TAB_REDIRECT, DEFAULT_ANALYSIS_TAB, DEFAULT_DRIVER_TAB, paths } from "../lib/constants";

const routes = createRoutesFromElements(appRoutes);

/** The leaf route's element type and params for a URL, or null if nothing matched. */
function resolve(url: string) {
  const [pathname, search = ""] = url.split("?");
  const matches = matchRoutes(routes, { pathname, search: search ? "?" + search : "" });
  if (!matches) return null;
  const leaf = matches[matches.length - 1];
  const element = leaf.route.element as React.ReactElement | undefined;
  return { type: element?.type, props: element?.props as Record<string, unknown> | undefined, params: leaf.params };
}

describe("route inventory", () => {
  it("home and season routes", () => {
    expect(resolve("/")?.type).toBe(HomePage);
    expect(resolve("/2026")?.type).toBe(HomePage);
    expect(resolve("/2026")?.params.year).toBe("2026");
    expect(resolve("/2026/trends")?.type).toBe(SeasonTrendsPage);
    expect(resolve("/2026/1294")?.type).toBe(HomePage);
    expect(resolve("/2026/1294")?.params.meetingKey).toBe("1294");
  });

  it("bare session and analysis prefixes redirect to the default tab", () => {
    const session = resolve("/2026/1294/11369");
    expect(session?.type).toBe(Navigate);
    expect(session?.props?.to).toBe(`analysis/${DEFAULT_ANALYSIS_TAB}`);

    const analysis = resolve("/2026/1294/11369/analysis");
    expect(analysis?.type).toBe(Navigate);
    expect(analysis?.props?.to).toBe(DEFAULT_ANALYSIS_TAB);
  });

  it("every analysis view resolves to AnalysisPage with its subTab", () => {
    for (const v of ANALYSIS_VIEWS) {
      const r = resolve(paths.analysis(2026, "1294", "11369", v.key));
      expect(r?.type).toBe(AnalysisPage);
      expect(r?.params.subTab).toBe(v.key);
    }
  });

  it("every legacy tab slug still resolves and maps to a live view", () => {
    const live = new Set<string>(ANALYSIS_VIEWS.map(v => v.key));
    for (const [legacy, target] of Object.entries(TAB_REDIRECT)) {
      const r = resolve(`/2026/1294/11369/analysis/${legacy}`);
      expect(r?.type, legacy).toBe(AnalysisPage);
      expect(live.has(target), `${legacy} → ${target}`).toBe(true);
    }
  });

  it("driver routes, including the ?cmp comparison state", () => {
    const bare = resolve("/2026/1294/11369/driver/1");
    expect(bare?.type).toBe(Navigate);
    expect(bare?.props?.to).toBe(DEFAULT_DRIVER_TAB);

    for (const tab of ["laps", "telemetry", "stints", "position", "weather", "rc", "results"]) {
      const r = resolve(paths.driver(2026, "1294", "11369", "1", tab));
      expect(r?.type, tab).toBe(DriverPage);
      expect(r?.params.driverNumber).toBe("1");
      expect(r?.params.tab).toBe(tab);
    }

    const withCmp = resolve("/2026/1294/11369/driver/1/telemetry?cmp=1-44,16-44");
    expect(withCmp?.type).toBe(DriverPage);
  });

  it("paths.* helpers emit the shapes above", () => {
    expect(paths.home()).toBe("/");
    expect(paths.meeting(2026, "1294")).toBe("/2026/1294");
    expect(paths.analysis(2026, "1294", "11369")).toBe(`/2026/1294/11369/analysis/${DEFAULT_ANALYSIS_TAB}`);
    expect(paths.driver(2026, "1294", "11369", "1")).toBe(`/2026/1294/11369/driver/1/${DEFAULT_DRIVER_TAB}`);
  });
});
