// Calendar export for upcoming race sessions. This is the re-engagement
// mechanism: dropping the weekend into the user's own calendar (with a 30-min
// alarm) is what actually pulls them back for the next session — no push
// infrastructure or notification permission required.

export interface CalEvent {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  url?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

// UTC compact form: YYYYMMDDTHHMMSSZ (used by both ICS and Google Calendar).
function toStamp(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// Escape per RFC 5545 for TEXT values.
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildICS(events: CalEvent[]): string {
  const stamp = toStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenF1ow//Race Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  events.forEach((e, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:openf1ow-${toStamp(e.start)}-${i}@openf1ow.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toStamp(e.start)}`,
      `DTEND:${toStamp(e.end)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${esc(e.url)}`);
    // 30-minute heads-up — the actual "reminder".
    lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(events: CalEvent[], filename: string) {
  const blob = new Blob([buildICS(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${toStamp(e.start)}/${toStamp(e.end)}`,
    details: e.description || "",
    location: e.location || "",
  });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
