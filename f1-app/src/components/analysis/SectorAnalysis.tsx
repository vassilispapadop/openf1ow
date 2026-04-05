import React, { useMemo, useRef } from "react";
import type { Driver, Lap } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import { ft3, podiumColor, rowBg } from "../../lib/format";
import { computeSlowLapThreshold, isCleanLap, median } from "../../lib/raceUtils";
import useTooltip from "./useTooltip";
import ScatterPlot from "./ScatterPlot";
import ShareButton from "../ShareButton";

function SectorAnalysis({ allLaps, drivers }: { allLaps: Lap[]; drivers: Driver[] }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { containerRef: secTipRef, show: secShow, hide: secHide, el: secTipEl } = useTooltip();

  const data = useMemo(() => {
    const threshold = computeSlowLapThreshold(allLaps);
    const lapMap: Record<number, Lap[]> = {};
    allLaps.forEach(l => {
      if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
      lapMap[l.driver_number].push(l);
    });

    const results = drivers.map(d => {
      const clean = (lapMap[d.driver_number] || []).filter(l =>
        isCleanLap(l, threshold) &&
        l.duration_sector_1 != null && l.duration_sector_2 != null && l.duration_sector_3 != null
      );
      if (clean.length < 3) return null;

      const s1 = clean.map(l => l.duration_sector_1!);
      const s2 = clean.map(l => l.duration_sector_2!);
      const s3 = clean.map(l => l.duration_sector_3!);

      return {
        driver: d,
        color: d.team_colour || "666",
        bestS1: Math.min(...s1), bestS2: Math.min(...s2), bestS3: Math.min(...s3),
        medS1: median(s1), medS2: median(s2), medS3: median(s3),
        theoretical: Math.min(...s1) + Math.min(...s2) + Math.min(...s3),
        actualBest: Math.min(...clean.map(l => l.lap_duration!)),
        laps: clean.length,
      };
    }).filter(Boolean) as NonNullable<typeof results[number]>[];

    // Session-wide best median per sector (for delta calculations)
    const bestMedS1 = results.length ? Math.min(...results.map(r => r.medS1)) : 0;
    const bestMedS2 = results.length ? Math.min(...results.map(r => r.medS2)) : 0;
    const bestMedS3 = results.length ? Math.min(...results.map(r => r.medS3)) : 0;
    const bestBestS1 = results.length ? Math.min(...results.map(r => r.bestS1)) : 0;
    const bestBestS2 = results.length ? Math.min(...results.map(r => r.bestS2)) : 0;
    const bestBestS3 = results.length ? Math.min(...results.map(r => r.bestS3)) : 0;

    // Per-driver: where they gain/lose relative to best median
    const enriched = results.map(r => ({
      ...r,
      deltaS1: r.medS1 - bestMedS1,
      deltaS2: r.medS2 - bestMedS2,
      deltaS3: r.medS3 - bestMedS3,
      totalDelta: (r.medS1 - bestMedS1) + (r.medS2 - bestMedS2) + (r.medS3 - bestMedS3),
      // Which sector is their weakest (largest gap to best)?
      weakest: [r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3].indexOf(
        Math.max(r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3)
      ),
      // Which is their strongest?
      strongest: [r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3].indexOf(
        Math.min(r.medS1 - bestMedS1, r.medS2 - bestMedS2, r.medS3 - bestMedS3)
      ),
    }));
    enriched.sort((a, b) => a.totalDelta - b.totalDelta);

    // Sector kings: who has best median in each sector
    const s1King = enriched.reduce((best, r) => r.medS1 < best.medS1 ? r : best, enriched[0]);
    const s2King = enriched.reduce((best, r) => r.medS2 < best.medS2 ? r : best, enriched[0]);
    const s3King = enriched.reduce((best, r) => r.medS3 < best.medS3 ? r : best, enriched[0]);

    return { results: enriched, bestMedS1, bestMedS2, bestMedS3, bestBestS1, bestBestS2, bestBestS3, s1King, s2King, s3King };
  }, [allLaps, drivers]);

  if (!data.results.length) return <div style={{ color: "#5a5a6e", fontSize: 13, padding: 20 }}>No sector data</div>;

  const S_COLORS = ["#e10600", "#fbbf24", "#a855f7"];
  const S_NAMES = ["S1", "S2", "S3"];
  const kings = [data.s1King, data.s2King, data.s3King];
  const maxDelta = Math.max(...data.results.map(r => Math.max(r.deltaS1, r.deltaS2, r.deltaS3)), 0.001);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <ShareButton domRef={contentRef} filename="openf1ow-sectors" />
      </div>
      <div ref={contentRef}>
      <div ref={secTipRef} style={{ position: "relative" }}>
      {secTipEl}

      {/* Sector Kings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {kings.map((k, i) => (
          <div key={i} style={{
            ...sty.card, marginBottom: 0, textAlign: "center",
            borderTop: "3px solid " + S_COLORS[i],
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: S_COLORS[i], letterSpacing: "0.5px", textTransform: "uppercase" as const }}>
              Fastest {S_NAMES[i]}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#" + k.color, fontFamily: F, margin: "4px 0" }}>
              {k.driver.name_acronym}
            </div>
            <div style={{ fontSize: 12, fontFamily: M, color: "#b0b0c0" }}>
              {[k.medS1, k.medS2, k.medS3][i].toFixed(3)}s
            </div>
            <div style={{ fontSize: 10, fontFamily: F, color: "#5a5a6e", marginTop: 2 }}>
              {k.driver.team_name}
            </div>
          </div>
        ))}
      </div>

      {/* Theoretical Best Lap */}
      {(() => {
        const theoKing = data.results.reduce((best, r) => r.theoretical < best.theoretical ? r : best, data.results[0]);
        return (
          <div style={{ ...sty.card, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px" }}>
            <div>
              <div style={sty.statLabel}>Theoretical Best Lap</div>
              <div style={{ fontSize: 10, color: "#5a5a6e" }}>Sum of best S1 + S2 + S3 across all drivers</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: M, color: "#22c55e" }}>{ft3(data.bestBestS1 + data.bestBestS2 + data.bestBestS3)}</div>
              <div style={{ fontSize: 10, color: "#5a5a6e" }}>
                {data.bestBestS1.toFixed(3)} + {data.bestBestS2.toFixed(3)} + {data.bestBestS3.toFixed(3)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Where Each Driver Gains/Loses — the main insight */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
        Sector Delta to Best (Median Pace)
      </div>
      <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
        How much time each driver loses per sector vs. the session-best median. Green = competitive, red = losing time. The bar shows where to find lap time.
      </div>

      {data.results.map((r, i) => {
        const deltas = [r.deltaS1, r.deltaS2, r.deltaS3];
        return (
          <div key={r.driver.driver_number} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "4px 0", cursor: "default",
          }}
            onMouseMove={e => secShow(e, (
              <div>
                <div style={{ fontWeight: 700, color: "#" + r.color, marginBottom: 4, fontFamily: F }}>{r.driver.full_name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "3px 10px", fontSize: 10 }}>
                  <span></span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Median</span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Best</span><span style={{ color: "#5a5a6e", fontWeight: 600 }}>Delta</span>
                  <span style={{ color: S_COLORS[0] }}>S1</span><span>{r.medS1.toFixed(3)}</span><span>{r.bestS1.toFixed(3)}</span><span style={{ color: r.deltaS1 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS1.toFixed(3)}</span>
                  <span style={{ color: S_COLORS[1] }}>S2</span><span>{r.medS2.toFixed(3)}</span><span>{r.bestS2.toFixed(3)}</span><span style={{ color: r.deltaS2 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS2.toFixed(3)}</span>
                  <span style={{ color: S_COLORS[2] }}>S3</span><span>{r.medS3.toFixed(3)}</span><span>{r.bestS3.toFixed(3)}</span><span style={{ color: r.deltaS3 < 0.05 ? "#22c55e" : "#ef4444" }}>+{r.deltaS3.toFixed(3)}</span>
                  <span style={{ color: "#5a5a6e" }}>Total</span><span style={{ fontWeight: 700 }}>{ft3(r.medS1 + r.medS2 + r.medS3)}</span><span>{ft3(r.theoretical)}</span><span style={{ fontWeight: 700, color: "#ef4444" }}>+{r.totalDelta.toFixed(3)}</span>
                </div>
              </div>
            ))}
            onMouseLeave={secHide}>
            <div style={{
              width: 22, textAlign: "right", fontWeight: 800, fontSize: 12,
              color: podiumColor(i), fontFamily: F, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{
              width: 44, fontWeight: 700, fontSize: 11, fontFamily: F,
              color: "#" + r.color, flexShrink: 0,
            }}>{r.driver.name_acronym}</div>
            {/* Three delta bars side by side */}
            <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
              {deltas.map((d, si) => {
                const pct = maxDelta > 0 ? (d / maxDelta) * 100 : 0;
                const isStrong = si === r.strongest;
                return (
                  <div key={si} style={{ flex: 1, position: "relative", height: 18 }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: "100%", height: 18, borderRadius: 3,
                      background: "rgba(255,255,255,0.02)",
                    }} />
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: Math.max(2, Math.min(100, pct)) + "%",
                      height: 18, borderRadius: 3,
                      background: d < 0.05 ? "rgba(34,197,94,0.4)" : d < 0.15 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)",
                      transition: "width 0.3s",
                    }} />
                    <div style={{
                      position: "absolute", top: 1, left: 4,
                      fontSize: 8, fontWeight: 600, color: S_COLORS[si], opacity: 0.6,
                    }}>{S_NAMES[si]}</div>
                    <div style={{
                      position: "absolute", top: 2, right: 4,
                      fontSize: 9, fontWeight: isStrong ? 700 : 500, fontFamily: M,
                      color: d < 0.05 ? "#22c55e" : d < 0.15 ? "#fbbf24" : "#ef4444",
                    }}>+{d.toFixed(3)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{
              fontFamily: M, fontSize: 10, fontWeight: 600, flexShrink: 0, width: 56, textAlign: "right",
              color: i === 0 ? "#22c55e" : "#ef4444",
            }}>
              {i === 0 ? "leader" : "+" + r.totalDelta.toFixed(3)}
            </div>
          </div>
        );
      })}
      {/* Speed Trap Analysis */}
      {(() => {
        const threshold = computeSlowLapThreshold(allLaps);
        const lapMap: Record<number, Lap[]> = {};
        allLaps.forEach(l => {
          if (!lapMap[l.driver_number]) lapMap[l.driver_number] = [];
          lapMap[l.driver_number].push(l);
        });
        const speedData = drivers.map(d => {
          const clean = (lapMap[d.driver_number] || []).filter(l => isCleanLap(l, threshold));
          const speeds = { st: [] as number[], i1: [] as number[], i2: [] as number[] };
          clean.forEach(l => {
            if (l.st_speed != null) speeds.st.push(l.st_speed);
            if (l.i1_speed != null) speeds.i1.push(l.i1_speed);
            if (l.i2_speed != null) speeds.i2.push(l.i2_speed);
          });
          if (speeds.st.length < 3 && speeds.i1.length < 3 && speeds.i2.length < 3) return null;
          return {
            driver: d, color: d.team_colour || "666",
            maxST: speeds.st.length ? Math.max(...speeds.st) : null,
            medST: speeds.st.length ? median(speeds.st) : null,
            maxI1: speeds.i1.length ? Math.max(...speeds.i1) : null,
            medI1: speeds.i1.length ? median(speeds.i1) : null,
            maxI2: speeds.i2.length ? Math.max(...speeds.i2) : null,
            medI2: speeds.i2.length ? median(speeds.i2) : null,
          };
        }).filter(Boolean) as NonNullable<typeof speedData[number]>[];

        if (!speedData.length || !speedData.some(s => s.medST || s.medI1 || s.medI2)) return null;

        // Find which speed columns have data
        const hasST = speedData.some(s => s.medST != null);
        const hasI1 = speedData.some(s => s.medI1 != null);
        const hasI2 = speedData.some(s => s.medI2 != null);
        const cols: { key: "ST" | "I1" | "I2"; label: string; getMed: (s: typeof speedData[0]) => number | null; getMax: (s: typeof speedData[0]) => number | null; color: string }[] = [];
        if (hasST) cols.push({ key: "ST", label: "Speed Trap", getMed: s => s.medST, getMax: s => s.maxST, color: "#e10600" });
        if (hasI1) cols.push({ key: "I1", label: "Intermediate 1", getMed: s => s.medI1, getMax: s => s.maxI1, color: "#fbbf24" });
        if (hasI2) cols.push({ key: "I2", label: "Intermediate 2", getMed: s => s.medI2, getMax: s => s.maxI2, color: "#a855f7" });

        // Sort by highest median speed trap (or first available)
        const sortCol = cols[0];
        speedData.sort((a, b) => (sortCol.getMed(b) || 0) - (sortCol.getMed(a) || 0));

        const topMeds = cols.map(c => Math.max(...speedData.map(s => c.getMed(s) || 0)));
        const minMeds = cols.map(c => Math.min(...speedData.filter(s => c.getMed(s) != null).map(s => c.getMed(s)!)));

        return (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Speed Trap Analysis (km/h)
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
              Median and peak speeds at each measurement point. Higher = more straight-line power or lower drag. The bar shows relative speed within the field.
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...sty.th, textAlign: "left" }}>Driver</th>
                    {cols.map(c => (
                      <th key={c.key} colSpan={2} style={{ ...sty.th, textAlign: "center", color: c.color }}>{c.label}</th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...sty.th }}></th>
                    {cols.map(c => (
                      <React.Fragment key={c.key}>
                        <th style={{ ...sty.th, textAlign: "right", fontSize: 9 }}>Median</th>
                        <th style={{ ...sty.th, textAlign: "right", fontSize: 9 }}>Peak</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {speedData.map((s, i) => (
                    <tr key={s.driver.driver_number} style={rowBg(i)}>
                      <td style={{ ...sty.td, borderLeft: "3px solid #" + s.color, paddingLeft: 12, fontWeight: 600 }}>
                        {s.driver.name_acronym}
                      </td>
                      {cols.map((c, ci) => {
                        const med = c.getMed(s);
                        const max = c.getMax(s);
                        const isTopMed = med != null && med === topMeds[ci];
                        return (
                          <React.Fragment key={c.key}>
                            <td style={{ ...sty.td, ...sty.mono, textAlign: "right", position: "relative" as const }}>
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: med != null && minMeds[ci] < topMeds[ci] ? ((med - minMeds[ci]) / (topMeds[ci] - minMeds[ci]) * 100) + "%" : "0%",
                                background: c.color, opacity: 0.08,
                              }} />
                              <span style={{
                                position: "relative",
                                fontWeight: isTopMed ? 700 : 400,
                                color: isTopMed ? c.color : "#b0b0c0",
                              }}>{med?.toFixed(0) ?? "\u2014"}</span>
                            </td>
                            <td style={{
                              ...sty.td, ...sty.mono, textAlign: "right",
                              color: max != null && max === Math.max(...speedData.map(x => c.getMax(x) || 0)) ? "#22c55e" : "#5a5a6e",
                              fontSize: 10,
                            }}>{max?.toFixed(0) ?? "\u2014"}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Sector Consistency — coefficient of variation */}
      {(() => {
        const consistencyData = data.results.map(r => {
          const s1Spread = r.medS1 > 0 ? ((r.medS1 - r.bestS1) / r.medS1) * 100 : 0;
          const s2Spread = r.medS2 > 0 ? ((r.medS2 - r.bestS2) / r.medS2) * 100 : 0;
          const s3Spread = r.medS3 > 0 ? ((r.medS3 - r.bestS3) / r.medS3) * 100 : 0;
          const avgSpread = (s1Spread + s2Spread + s3Spread) / 3;
          return { ...r, s1Spread, s2Spread, s3Spread, avgSpread };
        }).sort((a, b) => a.avgSpread - b.avgSpread);

        const maxSpread = Math.max(...consistencyData.map(r => Math.max(r.s1Spread, r.s2Spread, r.s3Spread)), 0.01);

        return (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Sector Consistency
            </div>
            <div style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 12 }}>
              How much variation between a driver's best and median sector time (lower = more consistent). Consistent drivers extract more from their car; high variance suggests mistakes or inconsistent conditions.
            </div>
            {consistencyData.map((r, i) => (
              <div key={r.driver.driver_number} style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 3, padding: "3px 0",
              }}>
                <div style={{
                  width: 22, textAlign: "right", fontWeight: 800, fontSize: 11,
                  color: podiumColor(i), fontFamily: F, flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{
                  width: 44, fontWeight: 700, fontSize: 11, fontFamily: F,
                  color: "#" + r.color, flexShrink: 0,
                }}>{r.driver.name_acronym}</div>
                <div style={{ flex: 1, display: "flex", gap: 2, alignItems: "center" }}>
                  {[r.s1Spread, r.s2Spread, r.s3Spread].map((spread, si) => (
                    <div key={si} style={{ flex: 1, position: "relative", height: 14 }}>
                      <div style={{
                        position: "absolute", top: 0, left: 0,
                        width: "100%", height: 14, borderRadius: 3,
                        background: "rgba(255,255,255,0.02)",
                      }} />
                      <div style={{
                        position: "absolute", top: 0, left: 0,
                        width: Math.max(2, (spread / maxSpread) * 100) + "%",
                        height: 14, borderRadius: 3,
                        background: spread < 0.3 ? "rgba(34,197,94,0.4)" : spread < 0.6 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)",
                      }} />
                      <div style={{
                        position: "absolute", top: 1, right: 4,
                        fontSize: 8, fontFamily: M, fontWeight: 600,
                        color: spread < 0.3 ? "#22c55e" : spread < 0.6 ? "#fbbf24" : "#ef4444",
                      }}>{spread.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  fontFamily: M, fontSize: 10, fontWeight: 600, flexShrink: 0, width: 48, textAlign: "right",
                  color: r.avgSpread < 0.3 ? "#22c55e" : r.avgSpread < 0.6 ? "#fbbf24" : "#ef4444",
                }}>
                  {r.avgSpread.toFixed(2)}%
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 9, color: "#5a5a6e" }}>
              {S_NAMES.map((n, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: S_COLORS[i], opacity: 0.6 }} />
                  <span>{n}</span>
                </div>
              ))}
              <span style={{ marginLeft: "auto" }}>Lower % = more consistent</span>
            </div>
          </div>
        );
      })()}

      {/* S1 Delta vs S2 Delta Scatter */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 10 }}>
          Sector Correlation: S1 vs S2 Delta
        </div>
        <p style={{ fontSize: 10, color: "#5a5a6e", marginBottom: 10 }}>
          Shows car characteristics — drivers clustered together have similar cars. Bottom-left = fast everywhere. Top-right = slow everywhere. Off-diagonal = trade-off between sectors.
        </p>
        <ScatterPlot
          data={data.results.map(r => ({ x: r.deltaS1, y: r.deltaS2, color: r.color, label: r.driver.name_acronym }))}
          xLabel="S1 Delta (s)" yLabel="S2 Delta (s)"
          xFmt={v => "+" + v.toFixed(3)} yFmt={v => "+" + v.toFixed(3)}
          diagonal
        />
      </div>
    </div>
    </div>
    </div>
  );
}

export default SectorAnalysis;
