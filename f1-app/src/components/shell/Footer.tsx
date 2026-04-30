import { F, C } from "../../lib/styles";

export default function Footer() {
  return (
    <footer style={{
      marginTop: 80,
      padding: "18px 28px",
      borderTop: "1px solid " + C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 11,
      color: C.textMute,
      fontFamily: F,
      fontWeight: 500,
      gap: 12,
      flexWrap: "wrap",
    }}>
      <span>
        <span style={{ color: C.textDim }}>openf1</span>
        <span style={{ color: C.accent }}>ow</span>
        <span style={{ marginLeft: 10, color: C.textFaint }}>not affiliated with Formula 1</span>
      </span>
      <span style={{ color: C.textFaint, display: "inline-flex", gap: 14, alignItems: "center" }}>
        <a href="/insights" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>recaps</a>
        <span>data · <a href="https://openf1.org" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>openf1.org</a></span>
      </span>
    </footer>
  );
}
