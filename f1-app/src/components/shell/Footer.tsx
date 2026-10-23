// Footer — flat, minimal, no decorative elements.

export default function Footer() {
  return (
    <footer style={{
      marginTop: 48, padding: "16px 28px",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 11, color: "var(--text-muted)",
      fontWeight: 500, gap: 12, flexWrap: "wrap",
    }}>
      <span>
        <span style={{ color: "var(--text-faint)" }}>openf1</span>
        <span style={{ color: "var(--accent)", fontWeight: 700 }}>ow</span>
        <span style={{ marginLeft: 10, color: "var(--text-faint)" }}>not affiliated with Formula 1</span>
      </span>
      <span style={{ color: "var(--text-faint)", display: "inline-flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <a href="/insights" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>recaps</a>
        <a href="/about" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>about · methodology</a>
        <span>data · <a href="https://openf1.org" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>openf1.org</a></span>
      </span>
    </footer>
  );
}
