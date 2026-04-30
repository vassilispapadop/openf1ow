import { F, C } from "../../lib/styles";
import Pill from "../Pill";
import ShareLinkButton from "../ShareLinkButton";
import type { Driver } from "../../lib/types";

interface HeaderProps {
  meetings: any[];
  mk: string;
  sessions: any[];
  sk: string;
  drivers?: Driver[];
  dn?: string;
  onReset?: () => void;
}

export default function Header({ meetings, mk, sessions, sk, drivers, dn, onReset }: HeaderProps) {
  const meeting = meetings.find(m => String(m.meeting_key) === mk);
  const session = sessions.find(s => String(s.session_key) === sk);
  const driver = dn && drivers ? drivers.find(d => String(d.driver_number) === dn) : undefined;
  const driverColor = driver?.team_colour ? "#" + driver.team_colour : C.text;

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      padding: "14px 28px",
      background: "rgba(10,10,13,0.85)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid " + C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
        <button
          onClick={onReset}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: onReset ? "pointer" : "default",
            display: "flex",
            alignItems: "baseline",
            gap: 0,
            color: "inherit",
            fontFamily: F,
          }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>open</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.accent, letterSpacing: "-0.02em" }}>f1</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>ow</span>
        </button>

        {meeting && (
          <nav className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, minWidth: 0 }}>
            <span style={{ color: C.textFaint }}>/</span>
            <span style={{ color: C.textDim, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {meeting.location || meeting.country_name}
            </span>
            {session && (
              <>
                <span style={{ color: C.textFaint }}>/</span>
                <span style={{ color: driver ? C.textDim : C.text, fontWeight: driver ? 500 : 600, whiteSpace: "nowrap" }}>
                  {session.session_name}
                </span>
              </>
            )}
            {driver && (
              <>
                <span style={{ color: C.textFaint }}>/</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: driverColor,
                    boxShadow: `0 0 0 2px ${driverColor}33`,
                  }} />
                  <span style={{ color: C.text, fontWeight: 600 }}>{driver.name_acronym}</span>
                </span>
              </>
            )}
          </nav>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShareLinkButton driverNumber={dn} />
        <Pill
          as="a"
          size="sm"
          active
          href="https://github.com/vassilispapadop/openf1ow"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          <span className="hide-mobile">github</span>
        </Pill>
        <Pill
          as="a"
          size="sm"
          href="https://openf1.org"
          target="_blank"
          rel="noreferrer"
          className="hide-mobile"
        >
          data · openf1.org
        </Pill>
      </div>
    </header>
  );
}
