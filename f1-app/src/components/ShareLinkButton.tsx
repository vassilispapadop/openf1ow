// Header "Share" pill. Resolves the current race to its slug and copies the
// canonical recap URL — that's the URL with a PNG preview when pasted into
// Twitter/Slack/Discord/iMessage.
//
// On a driver page, copies the SPA driver URL instead (Worker injects per-page
// OG tags there). Falls back to window.location.href if slug resolution fails.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../contexts/SessionContext";
import { findSlugForMeeting } from "../lib/raceIndex";
import { paths } from "../lib/constants";
import Pill from "./Pill";

type Status = "idle" | "copied" | "error";

interface Props {
  driverNumber?: string;
}

export default function ShareLinkButton({ driverNumber }: Props) {
  const { year, mk, sk } = useSession();
  const [slug, setSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!mk) { setSlug(null); return; }
    let cancelled = false;
    findSlugForMeeting(year, mk).then(s => { if (!cancelled) setSlug(s); });
    return () => { cancelled = true; };
  }, [year, mk]);

  const onClick = useCallback(async () => {
    const origin = window.location.origin;
    let url: string;
    if (driverNumber && mk && sk) {
      // Driver page: preserve current search params (e.g. ?cmp=14-26,11-22)
      // so a shared link reproduces the exact comparison overlay set.
      url = origin + window.location.pathname + window.location.search;
    } else if (slug) {
      // Race: canonical recap URL with PNG card preview.
      url = `${origin}/recap/${year}/${slug}`;
    } else {
      // Fallback if slug isn't resolved yet — share the current SPA URL.
      url = window.location.href;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }, [year, mk, sk, slug, driverNumber]);

  if (!mk) return null;

  const label = status === "copied" ? "Link copied" : status === "error" ? "Copy failed" : "Share";

  return (
    <Pill
      size="sm"
      onClick={onClick}
      title={driverNumber ? "Copy share link for this driver" : "Copy share link for this race"}
      aria-label="Copy share link"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      <span>{label}</span>
    </Pill>
  );
}
