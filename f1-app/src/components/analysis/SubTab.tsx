import React, { useState } from "react";
import { F } from "../../lib/styles";

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 14px",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 600,
        fontFamily: F,
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        borderRadius: 16,
        background: active ? "#e10600" : hovered ? "rgba(225,6,0,0.1)" : "transparent",
        color: active ? "#fff" : hovered ? "#e8e8ec" : "#6a6a7e",
        transition: "all 0.2s ease",
        outline: "none",
        boxShadow: active ? "0 0 10px rgba(225,6,0,0.25)" : "none",
      }}>{children}</button>
  );
}

export default SubTab;
