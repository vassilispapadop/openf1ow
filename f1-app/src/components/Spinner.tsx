import { F, C } from "../lib/styles";

export default function Spinner({ label, shimmer }: { label: string; shimmer?: boolean }) {
  return (
    <div className="fade-in" style={{
      textAlign: "center",
      padding: "64px 20px",
    }}>
      <div style={{
        width: 28,
        height: 28,
        border: "2px solid " + C.border,
        borderTopColor: C.text,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 14px",
      }} />
      <div style={{
        color: C.textDim,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: F,
      }}>{label}</div>
      {shimmer && (
        <div style={{
          width: 120,
          height: 1,
          margin: "12px auto 0",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}
