import { F, M, C } from "../../lib/styles";
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
      gap: 5,
      marginBottom: 16,
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
              padding: "3px 10px 3px 3px",
              borderRadius: 999,
              border: "1px solid " + (selected ? color : C.border),
              background: selected ? `${color}14` : C.surface,
              cursor: "pointer",
              transition: "border-color 0.15s ease, background 0.15s ease",
              outline: "none",
            }}
          >
            {d.headshot_url ? (
              <img
                src={d.headshot_url}
                alt=""
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  boxShadow: `inset 0 0 0 2px ${color}`,
                }}
              />
            ) : (
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: `${color}24`,
                color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                fontFamily: M,
              }}>
                {d.driver_number}
              </div>
            )}
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: F,
              color: selected ? C.text : C.textDim,
            }}>
              {d.name_acronym}
            </span>
          </button>
        );
      })}
    </div>
  );
}
