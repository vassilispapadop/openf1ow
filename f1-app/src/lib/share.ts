// Web Share API helpers. On mobile these open the native share sheet (X,
// WhatsApp, Messages, …) — far lower friction than copy-to-clipboard, which is
// the point of the share loop. All fall back gracefully when unsupported.

export function canShareFiles(files: File[]): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
  );
}

export function canShareUrl(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Returns true if the share sheet opened (or the user dismissed it — both are
// "handled"); false if the API is unavailable so callers can fall back to copy.
export async function shareUrl(opts: { url: string; title?: string; text?: string }): Promise<boolean> {
  if (!canShareUrl()) return false;
  try {
    await navigator.share({ url: opts.url, title: opts.title, text: opts.text });
    return true;
  } catch (e) {
    return (e as DOMException)?.name === "AbortError";
  }
}

export async function shareImage(
  blob: Blob,
  filename: string,
  opts?: { title?: string; text?: string },
): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (!canShareFiles([file])) return false;
  try {
    await navigator.share({ files: [file], title: opts?.title, text: opts?.text });
    return true;
  } catch (e) {
    return (e as DOMException)?.name === "AbortError";
  }
}
