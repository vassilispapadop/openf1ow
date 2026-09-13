#!/usr/bin/env node
// Shoot a list of routes against a base URL at 1280 wide, full page:
//   API_ORIGIN=https://www.openf1ow.com node scripts/shoot.mjs http://localhost:4173 out/ /2026/1281/11249/analysis/pace …
// API_ORIGIN answers /api/* from production, since a local preview runs the Worker on an empty R2.
import { chromium } from "playwright";
const [base, out, ...routes] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
// Local preview runs the Worker against an empty local R2; answer /api from production instead.
if (process.env.API_ORIGIN) {
  await page.route("**/api/**", async route => {
    const u = new URL(route.request().url());
    const r = await route.fetch({ url: process.env.API_ORIGIN + u.pathname + u.search });
    await route.fulfill({ response: r });
  });
}
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
for (const r of routes) {
  await page.goto(base + r, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);
  const name = r.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  // CLIP=<css selector> shoots just that element.
  if (process.env.CLIP) await page.locator(process.env.CLIP).first().screenshot({ path: `${out}/${name}.png` });
  else await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log("shot", r, `${out}/${name}.png`);
}
if (errors.length) { console.log("ERRORS:"); for (const e of errors) console.log(" ", e.slice(0, 300)); }
await browser.close();
