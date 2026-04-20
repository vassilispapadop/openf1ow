import { F, C } from "../../lib/styles";

export default function ViewToggle({ mode, onChange }: {
  mode: "list" | "graph";
  onChange: (m: "list" | "graph") => void;
}) {
  const btn = (m: "list" | "graph", label: string) => (
    <button
      onClick={() => onChange(m)}
      style={{
        padding: "4px 12px",
        border: "none",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: F,
        borderRadius: 999,
        background: mode === m ? C.surfaceHi : "transparent",
        color: mode === m ? C.text : C.textMute,
        transition: "background 0.15s ease, color 0.15s ease",
      }}>
      {label}
    </button>
  );
  return (
    <div style={{
      display: "inline-flex",
      background: C.surface,
      border: "1px solid " + C.border,
      borderRadius: 999,
      padding: 2,
      gap: 2,
    }}>
      {btn("list", "List")}
      {btn("graph", "Graph")}
    </div>
  );
}
