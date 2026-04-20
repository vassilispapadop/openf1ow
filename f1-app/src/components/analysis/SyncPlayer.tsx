import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { TranscriptSegment } from "../../lib/transcript";
import type { Driver, Lap, Stint, Pit } from "../../lib/types";
import { F, M, sty } from "../../lib/styles";
import LapEvolutionChart from "./LapEvolutionChart";
import GapChart from "./GapChart";
import PitStopRanking from "./PitStopRanking";
import SectorAnalysis from "./SectorAnalysis";
import StintDegradation from "./StintDegradation";

const VISUAL_LABELS: Record<string, string> = {
  lap_chart: "LAP CHART",
  gap_chart: "GAP CHART",
  pit_stops: "PIT STOPS",
  sector_times: "SECTORS",
  standings: "STANDINGS",
  tyre_strategy: "TYRE STRATEGY",
};

const VISUAL_COLORS: Record<string, string> = {
  lap_chart: "#e10600",
  gap_chart: "#0072C6",
  pit_stops: "#FFD700",
  sector_times: "#39B54A",
  standings: "#a855f7",
  tyre_strategy: "#FF6B35",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StandingsPanel({ results, drivers }: { results: any[]; drivers: Driver[] }) {
  const driverMap = useMemo(() => {
    const m: Record<number, Driver> = {};
    drivers.forEach(d => { m[d.driver_number] = d; });
    return m;
  }, [drivers]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: F }}>
        <thead>
          <tr>
            {["POS", "DRIVER", "TEAM", "GAP", "STATUS"].map(h => (
              <th key={h} style={{ ...sty.th, fontSize: 9 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r: any, i: number) => {
            const d = driverMap[r.driver_number];
            const name = r.driver || d?.name_acronym || `#${r.driver_number}`;
            const team = r.team || d?.team_name || "";
            const gap = r.gap || r.gap_to_leader || "—";
            const status = r.status || "Finished";
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                <td style={{ ...sty.td, fontFamily: M, fontWeight: 700, width: 36 }}>{r.position}</td>
                <td style={{ ...sty.td, fontWeight: 600 }}>{name}</td>
                <td style={{ ...sty.td, color: "#8a8aaa" }}>{team}</td>
                <td style={{ ...sty.td, fontFamily: M, fontSize: 11 }}>{gap}</td>
                <td style={{ ...sty.td, color: status === "Finished" ? "#39B54A" : "#e10600", fontSize: 10 }}>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SyncPlayer({ transcript, audioUrl, allLaps, drivers, stints, pits, results }: {
  transcript: TranscriptSegment[];
  audioUrl: string;
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  pits: Pit[];
  results: any[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Use real timestamps if available, fall back to estimated
  const timestamps = useMemo(
    () => transcript.map(s => s.timestamp ?? s.est_timestamp),
    [transcript],
  );

  // Find active segment via binary search
  const findSegment = useCallback((time: number) => {
    let lo = 0;
    let hi = timestamps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timestamps[mid] <= time) lo = mid; else hi = mid - 1;
    }
    return lo;
  }, [timestamps]);

  // Audio time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      setActiveIdx(findSegment(t));
    };
    const onDuration = () => setDuration(audio.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [findSegment]);

  // Auto-scroll transcript
  useEffect(() => {
    const el = segRefs.current[activeIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play(); else audio.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
    setActiveIdx(findSegment(t));
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const jumpToSegment = (idx: number) => {
    const t = timestamps[idx];
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setCurrentTime(t);
      setActiveIdx(idx);
    }
  };

  const activeSeg = transcript[activeIdx];
  const activeVisual = activeSeg?.visual || "standings";
  const focusDriver = activeSeg?.data_focus?.driver;

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
      {/* Left: Chart panel */}
      <div style={{ flex: "1 1 65%", minWidth: 0 }}>
        {/* Visual label */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
        }}>
          <span style={{
            background: (VISUAL_COLORS[activeVisual] || "#666") + "22",
            color: VISUAL_COLORS[activeVisual] || "#999",
            border: `1px solid ${(VISUAL_COLORS[activeVisual] || "#666") + "44"}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 10, fontWeight: 700, fontFamily: F,
            textTransform: "uppercase", letterSpacing: "0.8px",
          }}>
            {VISUAL_LABELS[activeVisual] || activeVisual}
          </span>
          {focusDriver && (
            <span style={{ fontSize: 11, color: "#8a8aaa", fontFamily: M }}>
              {focusDriver}
            </span>
          )}
        </div>

        {/* Chart panels — render only the active one so canvas charts get correct dimensions */}
        {activeVisual === "lap_chart" && <LapEvolutionChart allLaps={allLaps} drivers={drivers} />}
        {activeVisual === "gap_chart" && <GapChart allLaps={allLaps} drivers={drivers} focusDriver={focusDriver} />}
        {activeVisual === "pit_stops" && <PitStopRanking pits={pits} drivers={drivers} />}
        {activeVisual === "sector_times" && <SectorAnalysis allLaps={allLaps} drivers={drivers} />}
        {activeVisual === "standings" && <StandingsPanel results={results} drivers={drivers} />}
        {activeVisual === "tyre_strategy" && <StintDegradation allLaps={allLaps} drivers={drivers} stints={stints} viewMode="graph" />}
      </div>

      {/* Right: Transcript + controls */}
      <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", minWidth: 260 }}>
        {/* Transcript scroll */}
        <div style={{
          flex: 1, overflowY: "auto", marginBottom: 12,
          background: "rgba(12,12,24,0.6)", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.04)", padding: 12,
        }}>
          {transcript.map((seg, i) => {
            const isActive = i === activeIdx;
            const visColor = VISUAL_COLORS[seg.visual] || "#666";
            return (
              <div
                key={seg.segment}
                ref={el => { segRefs.current[i] = el; }}
                onClick={() => jumpToSegment(i)}
                style={{
                  padding: "8px 10px",
                  marginBottom: 4,
                  borderLeft: `3px solid ${isActive ? "#e10600" : "transparent"}`,
                  background: isActive ? "rgba(225,6,0,0.06)" : "transparent",
                  borderRadius: 6,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: "#4a4a62", fontFamily: M }}>
                    {formatTime(timestamps[i])}
                  </span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, fontFamily: F,
                    color: visColor, background: visColor + "18",
                    border: `1px solid ${visColor}33`,
                    borderRadius: 4, padding: "1px 5px",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    {VISUAL_LABELS[seg.visual] || seg.visual}
                  </span>
                </div>
                <div style={{
                  fontSize: 12, lineHeight: 1.5, fontFamily: F,
                  color: isActive ? "#e8e8ec" : "#8a8aaa",
                }}>
                  {seg.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Playback controls */}
        <div style={{
          background: "rgba(12,12,24,0.8)", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)", padding: 12,
        }}>
          <audio ref={audioRef} src={audioUrl} preload="metadata" />

          {/* Seek slider */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            style={{
              width: "100%", accentColor: "#e10600", cursor: "pointer",
              height: 4, marginBottom: 8,
            }}
          />

          {/* Time display */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, fontFamily: M, color: "#8a8aaa", marginBottom: 10,
          }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Play + speed */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={togglePlay} style={{
              background: "linear-gradient(135deg, #e10600, #b30500)",
              border: "none", borderRadius: 8, color: "#fff",
              width: 40, height: 40, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700,
            }}>
              {playing ? "\u23F8" : "\u25B6"}
            </button>

            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[0.5, 1, 1.5, 2].map(s => (
                <button key={s} onClick={() => changeSpeed(s)} style={{
                  background: speed === s ? "rgba(225,6,0,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${speed === s ? "rgba(225,6,0,0.3)" : "rgba(255,255,255,0.06)"}`,
                  color: speed === s ? "#e10600" : "#8a8aaa",
                  borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                  fontSize: 10, fontWeight: 700, fontFamily: M,
                }}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
