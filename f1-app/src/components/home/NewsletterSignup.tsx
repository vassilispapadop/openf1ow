import { useState } from "react";

/**
 * Newsletter signup — "Race Weekend Alerts"
 *
 * Connects to the user's email provider (MailerLite / Buttondown / Mailchimp).
 * Replace the `SIGNUP_URL` constant with the provider's form action URL.
 *
 * The hook is the single biggest lead-gen lever for F1: fans want live timing
 * alerts *before* the race.  Even a free Substack/MailerLite signup captures
 * emails for every future race.
 */

// ── CONFIG — replace with your provider's URL ────────────────────────
const SIGNUP_URL = "https://app.mailerlite.com/w/xxxxx"; // ← PUT YOURS HERE
const PROVIDER = "mailerlite" as string; // mailerlite | buttondown | mailchimp | custom

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setLoading(true);
    setError("");

    try {
      if (SIGNUP_URL.includes("xxxxx")) {
        // Fallback: open provider page directly
        window.open("https://www.mailerlite.com", "_blank");
        setSubmitted(true);
      } else if (PROVIDER === "buttondown") {
        const resp = await fetch(SIGNUP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, autorespond: true }),
        });
        if (!resp.ok) throw new Error("Signup failed");
        setSubmitted(true);
      } else {
        // Generic: POST to the configured URL
        await fetch(SIGNUP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f0f23, #1a1a3e)",
      borderRadius: 16,
      padding: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    }}>
      <h3 style={{
        margin: "0 0 4px",
        fontSize: 18,
        fontWeight: 700,
        background: "linear-gradient(135deg, #f39c12, #e67e22)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        🔔 Race Weekend Alerts
      </h3>
      <p style={{
        margin: "0 0 16px",
        fontSize: 13,
        color: "rgba(255,255,255,0.5)",
        lineHeight: 1.4,
      }}>
        Get a push email 30 min before lights out. Never miss a session.
      </p>

      {submitted ? (
        <div style={{
          padding: "12px 16px",
          background: "rgba(46,204,113,0.1)",
          border: "1px solid rgba(46,204,113,0.3)",
          borderRadius: 8,
          color: "#2ecc71",
          fontSize: 14,
          fontWeight: 600,
          textAlign: "center",
        }}>
          ✅ You're in! Watch your inbox for the first alert.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            placeholder="racing@yourdomain.com"
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              marginBottom: error ? 8 : 12,
              background: "rgba(255,255,255,0.05)",
              border: error
                ? "1px solid rgba(231,76,60,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{
              fontSize: 12,
              color: "#e74c3c",
              marginBottom: 8,
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: loading
                ? "rgba(255,255,255,0.1)"
                : "linear-gradient(135deg, #f39c12, #e67e22)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.2s ease",
            }}
          >
            {loading ? "⏳ Subscribing..." : "🏁 Subscribe Free"}
          </button>
        </form>
      )}

      <div style={{
        marginTop: 8,
        fontSize: 11,
        color: "rgba(255,255,255,0.3)",
        textAlign: "center",
      }}>
        Free. No spam. Unsubscribe anytime.
      </div>
    </div>
  );
}
