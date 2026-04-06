import { F, M } from "../../lib/styles";
import type { Driver } from "../../lib/types";

export default function DriverGrid({ drivers, dn, onDriver }: {
  drivers: Driver[];
  dn: string;
  onDriver: (v: string) => void;
}) {
  if (!drivers.length) return null;

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 14,
      padding: "10px 0",
    }}>
      {drivers.map(d => {
        const selected = String(d.driver_number) === dn;
        const color = "#" + (d.team_colour || "666");
        return (
          <button
            key={d.driver_number}
            onClick={() => onDriver(String(d.driver_number))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px 4px 4px",
              borderRadius: 10,
              border: selected ? `2px solid ${color}` : "2px solid transparent",
              background: selected ? `${color}18` : "rgba(255,255,255,0.02)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: "none",
            }}
          >
            {d.headshot_url ? (
              <img
                src={d.headshot_url}
                alt=""
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  objectFit: "cover",
                }}
              />
            ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: `2px solid ${color}`,
                background: `${color}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                fontFamily: M,
                color,
              }}>
                {d.driver_number}
              </div>
            )}
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: F,
              color: selected ? "#e8e8ec" : "#5a5a6e",
              letterSpacing: "0.3px",
            }}>
              {d.name_acronym}
            </span>
          </button>
        );
      })}
    </div>
  );
}
