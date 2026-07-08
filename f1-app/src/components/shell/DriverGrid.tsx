import { F, M, C } from "../../lib/styles";
import type { Driver } from "../../lib/types";
import { useFollowedDrivers } from "../../lib/retention";

export default function DriverGrid({ drivers, dn, onDriver }: {
  drivers: Driver[];
  dn: string;
  onDriver: (v: string) => void;
}) {
  const { isFollowed, toggle } = useFollowedDrivers();
  if (!drivers.length) return null;

  // Followed drivers pinned to the front (Array.prototype.sort is stable, so
  // order within each group is preserved) — a small personalisation that makes
  // a returning visitor's driver the first thing they see.
  const ordered = [...drivers].sort(
    (a, b) => (isFollowed(a.driver_number) ? 0 : 1) - (isFollowed(b.driver_number) ? 0 : 1),
  );

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 5,
      marginBottom: 16,
    }}>
      {ordered.map(d => {
        const selected = String(d.driver_number) === dn;
        const color = "#" + (d.team_colour || "666");
        const followed = isFollowed(d.driver_number);
        return (
          <button
            key={d.driver_number}
            onClick={() => onDriver(String(d.driver_number))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px 3px 3px",
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
            <span
              role="button"
              tabIndex={0}
              aria-label={followed ? `Unfollow ${d.name_acronym}` : `Follow ${d.name_acronym}`}
              aria-pressed={followed}
              title={followed ? "Following — click to unfollow" : "Follow driver"}
              onClick={(e) => { e.stopPropagation(); toggle(d.driver_number); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(d.driver_number);
                }
              }}
              style={{
                marginLeft: 1,
                fontSize: 12,
                lineHeight: 1,
                color: followed ? C.warn : C.textFaint,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                padding: "2px",
              }}
            >
              {followed ? "★" : "☆"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
