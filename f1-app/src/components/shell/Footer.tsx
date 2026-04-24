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
      <span style={{ color: C.textFaint, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>
          data · <a href="https://openf1.org" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>openf1.org</a>
        </span>
        <span>·</span>
        <a
          href="https://github.com/vassilispapadop/openf1ow"
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3, display: "inline-flex", alignItems: "center", gap: 4 }}
          aria-label="GitHub repository"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          github
        </a>
      </span>
    </footer>
  );
}
