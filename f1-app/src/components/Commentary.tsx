import { useState, useEffect } from "react";
import type { Driver, Lap, Stint, Pit } from "../lib/types";
import { parseTranscript, type TranscriptSegment } from "../lib/transcript";
import { F, M, sty } from "../lib/styles";
import SyncPlayer from "./analysis/SyncPlayer";

export default function Commentary({ sessionKey, allLaps, drivers, stints, pits, results }: {
  sessionKey: string;
  allLaps: Lap[];
  drivers: Driver[];
  stints: Stint[];
  pits: Pit[];
  results: any[];
}) {
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");

  useEffect(() => {
    setStatus("loading");
    setTranscript(null);
    setAudioUrl(null);

    const base = `/commentary/${sessionKey}`;

    fetch(`${base}/transcript.json`)
      .then(res => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then(data => {
        const parsed = parseTranscript(data);
        setTranscript(parsed);
        setAudioUrl(`${base}/commentary.mp3`);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("not_found");
      });
  }, [sessionKey]);

  if (status === "loading") {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 40, color: "#8a8aaa", fontFamily: F }}>
          Loading commentary...
        </div>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8ec", fontFamily: F, marginBottom: 12 }}>
            No Commentary Available
          </div>
          <div style={{ fontSize: 12, color: "#8a8aaa", fontFamily: F, lineHeight: 1.8, maxWidth: 480, margin: "0 auto" }}>
            Run the commentary pipeline to generate audio for this session:
          </div>
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 8,
            padding: "12px 16px", marginTop: 16, display: "inline-block",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <code style={{ fontFamily: M, fontSize: 12, color: "#e10600" }}>
              cd pipeline<br />
              python run_pipeline.py race-analysis-{sessionKey}.json --session-key {sessionKey}
            </code>
          </div>
          <div style={{ fontSize: 11, color: "#4a4a62", fontFamily: F, marginTop: 16, lineHeight: 1.6 }}>
            First export the race data using the "Export JSON" button above,<br />
            then place the file in the pipeline directory and run the command.
          </div>
        </div>
      </div>
    );
  }

  if (!transcript || !audioUrl) return null;

  return (
    <div style={sty.card}>
      <SyncPlayer
        transcript={transcript}
        audioUrl={audioUrl}
        allLaps={allLaps}
        drivers={drivers}
        stints={stints}
        pits={pits}
        results={results}
      />
    </div>
  );
}
