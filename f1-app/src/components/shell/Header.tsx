import { F, C } from "../../lib/styles";
import Pill from "../Pill";
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
    </header>
  );
}
