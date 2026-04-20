import React from "react";
import { F, C } from "../../lib/styles";

export default function SubTab({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        border: "1px solid " + (active ? C.borderStrong : "transparent"),
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: F,
        borderRadius: 999,
        background: active ? C.surfaceHi : "transparent",
        color: active ? C.text : C.textDim,
        transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
        outline: "none",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.text; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.textDim; }}
    >
      {children}
    </button>
  );
}
