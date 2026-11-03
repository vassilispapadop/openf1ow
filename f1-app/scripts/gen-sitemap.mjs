#!/usr/bin/env node
/**
 * Reads public/race-index.json and writes public/sitemap.xml.
 *
 * Emits the canonical numeric URLs (matching App.tsx routes):
 *   /
 *   /:year/:mk
 *   /:year/:mk/:sk/analysis/overview         (race)
 *   /:year/:mk/:sk_qual/analysis/overview    (qualifying)
 *   /:year/:mk/:sk_sprint/analysis/overview  (sprint, if present)
 *
 * Phase 2 will add slug URLs and recap pages.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const INDEX = join(REPO_ROOT, "public", "race-index.json");
const OUT = join(REPO_ROOT, "public", "sitemap.xml");
const ORIGIN = "https://www.openf1ow.com";

const idx = JSON.parse(readFileSync(INDEX, "utf-8"));

const urls = [];

// Home
urls.push({ loc: ORIGIN + "/", changefreq: "daily", priority: "1.0" });

// About / methodology page
urls.push({ loc: ORIGIN + "/about", changefreq: "monthly", priority: "0.6" });

// Insights index + per-season listings + season trends
urls.push({ loc: ORIGIN + "/insights", changefreq: "daily", priority: "0.9" });
for (const year of Object.keys(idx.byYear).sort().reverse()) {
  urls.push({ loc: `${ORIGIN}/insights/${year}`, changefreq: "weekly", priority: "0.7" });
  urls.push({ loc: `${ORIGIN}/${year}/trends`, changefreq: "weekly", priority: "0.7" });
}

const now = Date.now();

for (const [year, races] of Object.entries(idx.byYear)) {
  for (const r of races) {
    const meetingDate = r.dateStart ? new Date(r.dateStart).getTime() : 0;
    const isPast = meetingDate && meetingDate < now;

    // Slug recap — the canonical SEO landing page for this race
    urls.push({
      loc: `${ORIGIN}/recap/${year}/${r.slug}`,
      lastmod: r.dateStart || undefined,
      changefreq: isPast ? "yearly" : "weekly",
      priority: isPast ? "0.8" : "0.7",
    });

    // Numeric analysis URLs — these are the canonical, indexed pages (the slug
    // forms redirect to them), so list them directly. Race/sprint also get the
    // pace tab, which is the best-converting landing page in Search Console.
    const indexable = ["race", "qualifying", "sprint"];
    for (const key of indexable) {
      const sk = r.sessions[key];
      if (!sk) continue;
      const base = `${ORIGIN}/${year}/${r.meetingKey}/${sk}/analysis`;
      const tabs = key === "qualifying" ? ["overview"] : ["overview", "pace"];
      for (const tab of tabs) {
        urls.push({
          loc: `${base}/${tab}`,
          lastmod: r.dateStart || undefined,
          changefreq: isPast ? "yearly" : "weekly",
          priority: key === "race" ? (tab === "pace" ? "0.8" : "0.7") : "0.6",
        });
      }
    }
  }
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u =>
    `  <url>\n` +
    `    <loc>${u.loc}</loc>\n` +
    (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
    `    <changefreq>${u.changefreq}</changefreq>\n` +
    `    <priority>${u.priority}</priority>\n` +
    `  </url>\n`
  ).join("") +
  `</urlset>\n`;

writeFileSync(OUT, xml);
console.log(`Wrote ${OUT} — ${urls.length} URLs`);
