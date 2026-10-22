import { useState, useRef, useEffect } from "react";
import { api } from "../../lib/api";

interface Meeting {
  meeting_key: number;
  meeting_name: string;
  country_name: string;
  year: number;
  circuit_short_name: string;
  date_start: string;
}

interface Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
}

/**
 * Shareable race card — generates a high-quality PNG of any race session
 * suitable for Twitter/Reddit/X sharing.
 *
 * Click any session to create a card → download PNG → paste into your post.
 * This is the #1 viral mechanic for F1 content: beautiful, instant,
 * shareable images that drive organic traffic back to openf1ow.com.
 */
export default function SocialShareCard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Load meetings and sessions
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api("/meetings").then((d: Meeting[]) => !cancelled && setMeetings(d?.filter(Boolean) || [])),
      api("/sessions").then((d: Session[]) => !cancelled && setSessions(d?.filter(Boolean) || [])),
    ]).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Group sessions by meeting
  const sessionsByMeeting = meetings.reduce<Record<number, Session[]>>((acc, m) => {
    acc[m.meeting_key] = (sessions.filter(s => s.meeting_key === m.meeting_key)).sort(
      (a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
    );
    return acc;
  }, {});

  async function generateImage() {
    if (!selectedKey || !selectedSessionKey) return;
    setGenerating(true);

    // Call the Cloudflare Worker's /api/og endpoint (same as page OG tags)
    const url = `/api/og?session_key=${selectedSessionKey}&view=analysis&subTab=overview`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Failed");
      const svgBlob = await resp.blob();
      const imgSrc = URL.createObjectURL(svgBlob);

      // Draw on canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          // Set the generated image URL for display
          setImgUrl(imgSrc);
          setGenerating(false);
        };
        img.onerror = () => {
          setGenerating(false);
          setDownloaded(false);
        };
        img.src = imgSrc;
      }
    } catch {
      setGenerating(false);
      setDownloaded(false);
    }
  }

  function downloadAsPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `openf1ow-${selectedKey}-${selectedSessionKey}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }

  const selectedMeeting = meetings.find(m => m.meeting_key === selectedKey);
  // selectedSession is intentionally not used — the OG endpoint handles session details

  return (
    <div style={{
      background: "linear-gradient(135deg, #1a1a2e, #16213e)",
      borderRadius: 16,
      padding: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    }}>
      <h3 style={{
        margin: "0 0 4px",
        fontSize: 18,
        fontWeight: 700,
        background: "linear-gradient(135deg, #e94560, #ff6b6b)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        📸 Share This Race
      </h3>
      <p style={{
        margin: "0 0 16px",
        fontSize: 13,
        color: "rgba(255,255,255,0.5)",
        lineHeight: 1.4,
      }}>
        Generate a beautiful image to share on X/Reddit. Drives organic traffic!
      </p>

      {/* Meeting selector */}
      <div style={{ marginBottom: 12 }}>
        <label style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "rgba(255,255,255,0.4)",
          display: "block",
          marginBottom: 4,
        }}>Race</label>
        <select
          value={selectedKey || ""}
          onChange={e => {
            const k = Number(e.target.value);
            setSelectedKey(k);
            setSelectedSessionKey(null);
            setImgUrl(null);
          }}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">Select a race...</option>
          {meetings.sort((a, b) => b.year - a.year || b.meeting_key - a.meeting_key).map(m => (
            <option key={m.meeting_key} value={m.meeting_key}>
              {m.year} {m.meeting_name}
            </option>
          ))}
        </select>
      </div>

      {/* Session selector */}
      {selectedKey && sessionsByMeeting[selectedKey] && (
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "rgba(255,255,255,0.4)",
            display: "block",
            marginBottom: 4,
          }}>Session</label>
          <select
            value={selectedSessionKey || ""}
            onChange={e => {
              setSelectedSessionKey(Number(e.target.value));
              setImgUrl(null);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">Select a session...</option>
            {sessionsByMeeting[selectedKey].map(s => (
              <option key={s.session_key} value={s.session_key}>
                {s.session_name} ({new Date(s.date_start).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Generate button */}
      {(selectedKey && selectedSessionKey) && (
        <button
          onClick={generateImage}
          disabled={generating}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: generating
              ? "rgba(255,255,255,0.1)"
              : "linear-gradient(135deg, #e94560, #ff6b6b)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.7 : 1,
            transition: "all 0.2s ease",
            marginBottom: 12,
          }}
        >
          {generating ? "⏳ Generating..." : "🖼️ Generate Image"}
        </button>
      )}

      {/* Canvas (hidden) */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Download button */}
      {imgUrl && (
        <button
          onClick={downloadAsPng}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: downloaded
              ? "#27ae60"
              : "linear-gradient(135deg, #2ecc71, #27ae60)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {downloaded ? "✅ Downloaded!" : "⬇️ Download PNG"}
        </button>
      )}

      {/* Tip */}
      {imgUrl && (
        <div style={{
          marginTop: 12,
          padding: "8px 12px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 8,
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.5,
        }}>
          💡 Tip: After downloading, post the image on X/Reddit with a key insight
          and link: <span style={{ color: "#87CEEB" }}>openf1ow.com</span>
        </div>
      )}
    </div>
  );
}
