import { C } from "../../lib/styles";
import Pill from "../Pill";

export default function ViewToggle({ mode, onChange }: {
  mode: "list" | "graph";
  onChange: (m: "list" | "graph") => void;
}) {
  return (
    <div style={{
      display: "inline-flex",
      background: C.surface,
      border: "1px solid " + C.border,
      borderRadius: 999,
      padding: 2,
      gap: 2,
    }}>
      <Pill size="sm" active={mode === "list"} onClick={() => onChange("list")}>List</Pill>
      <Pill size="sm" active={mode === "graph"} onClick={() => onChange("graph")}>Graph</Pill>
    </div>
  );
}
