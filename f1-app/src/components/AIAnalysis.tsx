import { useState, useCallback, useRef, useEffect } from "react";
import { buildFullSummary, type RaceSummaryInput } from "../lib/buildAnalysisSummary";
import { F, M, sty } from "../lib/styles";

// Simple markdown-to-JSX renderer for headers, bold, lists
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} style={{
          fontSize: 16, fontWeight: 800, color: "#e10600", fontFamily: F,
          margin: "20px 0 8px", letterSpacing: "0.3px",
          borderBottom: "1px solid rgba(225,6,0,0.2)", paddingBottom: 6,
        }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} style={{
          fontSize: 18, fontWeight: 800, color: "#e8e8ec", fontFamily: F,
          margin: "16px 0 10px",
        }}>
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, lineHeight: 1.6 }}>
          <span style={{ color: "#e10600", flexShrink: 0 }}>&#8226;</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: "4px 0", lineHeight: 1.7 }}>
          {renderInline(line)}
        </p>
      );
    }
  }

  return elements;
}

function renderInline(text: string) {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#e8e8ec", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

interface AIAnalysisProps {
  allLaps: any[];
  drivers: any[];
  stints: any[];
  pits: any[];
  weather: any[];
  raceControl: any[];
  results: any[];
}

export default function AIAnalysis({ allLaps, drivers, stints, pits, weather, raceControl, results }: AIAnalysisProps) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chunkRef = useRef("");
  const rafRef = useRef(0);

  // Reset when race data changes, abort on unmount
  useEffect(() => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    setAnalysis("");
    setError("");
    setLoading(false);
    return () => {
      abortRef.current?.abort();
      cancelAnimationFrame(rafRef.current);
    };
  }, [allLaps]);

  // Auto-scroll as text streams in
  useEffect(() => {
    if (loading && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [analysis, loading]);

  const generate = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setAnalysis("");
    chunkRef.current = "";

    try {
      const summary = buildFullSummary({
        allLaps, drivers, stints, pits, weather, raceControl, results,
      } as RaceSummaryInput);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Batch updates via requestAnimationFrame to avoid O(n^2) re-renders
      const flushChunks = () => {
        const pending = chunkRef.current;
        if (pending) {
          chunkRef.current = "";
          setAnalysis(prev => prev + pending);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              chunkRef.current += parsed.text;
              cancelAnimationFrame(rafRef.current);
              rafRef.current = requestAnimationFrame(flushChunks);
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      // Flush any remaining text
      flushChunks();
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message || "Failed to generate analysis");
    }
    setLoading(false);
  }, [allLaps, drivers, stints, pits, weather, raceControl, results]);

  // Initial state — no analysis yet
  if (!analysis && !loading && !error) {
    return (
      <div style={sty.card}>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{
            width: 48, height: 48, margin: "0 auto 16px",
            background: "linear-gradient(135deg, rgba(225,6,0,0.15), rgba(168,85,247,0.15))",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
          }}>
            &#9733;
          </div>
          <div style={{ ...sty.sectionHead, marginBottom: 12 }}>AI Race Analysis</div>
          <p style={{ color: "#b0b0c0", fontSize: 13, marginBottom: 20, lineHeight: 1.6, maxWidth: 480, margin: "0 auto 20px" }}>
            Generate an expert race breakdown powered by AI — covering strategy, pace, tire management, key battles, and a race verdict. All insights are derived from the telemetry data.
          </p>
          <button onClick={generate} style={{
            background: "linear-gradient(135deg, #e10600, #a855f7)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "12px 32px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: F,
            letterSpacing: "0.3px",
            transition: "all 0.2s ease",
          }}>
            Generate AI Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={sty.card}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={sty.sectionHead}>AI Race Analysis</span>
          {loading && (
            <span style={{
              fontSize: 10, color: "#a855f7", fontWeight: 600, fontFamily: M,
              animation: "pulse 1.5s ease-in-out infinite",
            }}>
              analyzing...
            </span>
          )}
        </div>
        {!loading && analysis && (
          <button onClick={generate} style={{
            background: "rgba(255,255,255,0.06)",
            color: "#b0b0c0",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: F,
            transition: "all 0.2s ease",
          }}>
            Regenerate
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(220, 38, 38, 0.12)",
          border: "1px solid rgba(220, 38, 38, 0.2)",
          padding: "12px 16px",
          borderRadius: 8,
          fontSize: 12,
          color: "#fca5a5",
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        style={{
          fontSize: 13,
          color: "#c8c8d0",
          fontFamily: F,
          lineHeight: 1.7,
          maxHeight: 600,
          overflowY: "auto",
          paddingRight: 8,
        }}
      >
        {renderMarkdown(analysis)}
        {loading && (
          <span style={{
            display: "inline-block",
            width: 6, height: 14,
            background: "#a855f7",
            marginLeft: 2,
            animation: "blink 0.8s step-end infinite",
            verticalAlign: "text-bottom",
          }} />
        )}
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
