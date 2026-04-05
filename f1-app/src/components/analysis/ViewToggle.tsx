import React from "react";
import { F } from "../../lib/styles";

function ViewToggle({ mode, onChange }: { mode: "list" | "graph"; onChange: (m: "list" | "graph") => void }) {
  const btn = (m: "list" | "graph", label: string) => (
    <button onClick={() => onChange(m)} style={{
      padding: "4px 12px", border: "none", cursor: "pointer",
      fontSize: 10, fontWeight: 700, fontFamily: F,
      letterSpacing: "0.5px",
      borderRadius: m === "list" ? "6px 0 0 6px" : "0 6px 6px 0",
      background: mode === m ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
      color: mode === m ? "#e8e8ec" : "#5a5a6e",
      transition: "all 0.15s ease",
    }}>{label}</button>
  );
  return <div style={{ display: "inline-flex" }}>{btn("list", "LIST")}{btn("graph", "GRAPH")}</div>;
}

export default ViewToggle;
