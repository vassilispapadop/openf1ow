import { useState } from "react";
import { F } from "../lib/styles";

export default function Tab({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 18px",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: F,
        textTransform: "uppercase" as const,
        letterSpacing: "0.8px",
        whiteSpace: "nowrap" as const,
        borderRadius: 8,
        background: active
          ? "linear-gradient(135deg, #e10600, #b80500)"
          : hovered ? "rgba(225,6,0,0.08)" : "rgba(255,255,255,0.02)",
        color: active ? "#fff" : hovered ? "#e8e8ec" : "#5a5a6e",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        outline: "none",
        boxShadow: active ? "0 2px 12px rgba(225,6,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
        border: active ? "none" : "1px solid transparent",
      }}>{children}</button>
  );
}
