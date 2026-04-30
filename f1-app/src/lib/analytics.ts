// Google Analytics 4 wrapper. Active only when VITE_GA_ID is set at build
// time (typically G-XXXXXXXXXX). When unset, every function is a no-op so
// dev sessions don't pollute analytics.
//
// We disable GA's automatic page_view because React Router's client-side
// navigation doesn't trigger a real page load — auto-tracking would only
// see the initial document and miss every in-app navigation.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID: string | undefined = import.meta.env.VITE_GA_ID;

let booted = false;

export function initAnalytics(): void {
  if (booted || !GA_ID || typeof window === "undefined") return;
  booted = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  // gtag is implemented as a thin shim that pushes into dataLayer; the GA
  // library replaces it once loaded. The shim must remain a real function
  // (not arrow) so `arguments` works.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
}

export function trackPageview(path: string, title?: string): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title ?? document.title,
  });
}

// Generic custom-event helper for things like "race_selected", "share_clicked".
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}
