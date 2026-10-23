// Minimal top bar: logo, season nav, race selector.
// No search, no follow buttons, no GitHub extras — just what you need to get to data.

import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { api } from "../../lib/api";
import { useState, useEffect, useMemo } from "react";

// ── Minimal dropdown selector ───────────────────────────────────────
function Select({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "transparent",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "6px 32px 6px 10px",
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "var(--font)",
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a8a94'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Top bar ─────────────────────────────────────────────────────────
export default function Header() {
  const { year, mk, sk } = useSession();
  const navigate = useNavigate();
  const [raceOptions, setRaceOptions] = useState<{ value: string; label: string }[]>([]);
  const [sessionOptions, setSessionOptions] = useState<{ value: string; label: string }[]>([]);

  // Year range — just show 2021 through current+1
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: currentYear - 2020 }, (_, i) => 2021 + i)
      .map(y => ({ value: String(y), label: String(y) })),
    [currentYear]
  );

  // Fetch race list when year changes
  useEffect(() => {
    let cancelled = false;
    api(`/meetings?year=${year}`)
      .then(d => {
        if (cancelled) return;
        const races = Array.isArray(d) ? d : [];
        setRaceOptions(
          races
            .filter((m: any) => !m.meeting_name?.toLowerCase().includes("testing") && !m.is_cancelled)
            .sort((a: any, b: any) => (a.date_start || "").localeCompare(b.date_start || ""))
            .map((m: any) => ({
              value: String(m.meeting_key),
              label: m.meeting_name || `${m.country_name || m.location} Grand Prix`,
            }))
        );
      })
      .catch(() => setRaceOptions([]));
    return () => { cancelled = true; };
  }, [year]);

  // Fetch sessions when race selected
  useEffect(() => {
    if (!mk) { setSessionOptions([]); return; }
    let cancelled = false;
    api(`/sessions?meeting_key=${mk}`)
      .then(d => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setSessionOptions(
          list.map((s: any) => ({
            value: String(s.session_key),
            label: s.session_name,
          }))
        );
      })
      .catch(() => setSessionOptions([]));
    return () => { cancelled = true; };
  }, [mk]);

  return (
    <header style={{
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}>
        {/* Logo */}
        <NavLink
          to="/"
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text)",
            textDecoration: "none",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font)",
            flexShrink: 0,
          }}
        >
          openf1ow
        </NavLink>

        {/* Year selector */}
        <Select
          options={yearOptions}
          value={String(year)}
          onChange={v => navigate(`/${v}`)}
        />

        {/* Race selector */}
        <Select
          options={raceOptions}
          value={mk || ""}
          onChange={v => {
            if (v) navigate(`/${year}/${v}`);
          }}
          placeholder="Select race"
        />

        {/* Session selector */}
        {sessionOptions.length > 0 && (
          <Select
            options={sessionOptions}
            value={sk || ""}
            onChange={v => {
              if (v) navigate(`/${year}/${mk}/${v}`);
            }}
            placeholder="Select session"
          />
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* GitHub link — minimal, quiet */}
        <a
          href="https://github.com/vassilispapadop/openf1ow"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            textDecoration: "none",
            opacity: 0.6,
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
