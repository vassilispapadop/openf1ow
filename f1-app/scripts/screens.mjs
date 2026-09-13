#!/usr/bin/env node
/**
 * Screenshot pass for visual regression. Captures a fixed list of routes at
 * three viewport widths into screenshots/<label>/, and can diff two captures.
 *
 *   node scripts/screens.mjs                       # capture from a local build
 *   node scripts/screens.mjs --base https://www.openf1ow.com --label prod
 *   node scripts/screens.mjs --diff prod <git-sha>  # pixelmatch, writes *-diff.png
 *
 * Without --base it runs `vite preview` on a free port and shoots that, so
 * `npm run build` must have run first. The label defaults to the short git SHA.
 * Requires `npx playwright install chromium` once.
 */

import { spawn, execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "screenshots");
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

// Route inventory, one per page shape. Uses a settled 2026 weekend so the data
// is stable; swap keys if a session is missing from the index.
// Suzuka 2026: a settled weekend with race, qualifying and telemetry all published.
const YEAR = 2026, MK = "1281", SK = "11253", QSK = "11249", DN = "1";
export const ROUTES = [
  "/",
  `/${YEAR}/trends`,
  `/${YEAR}/${MK}/${SK}/analysis/overview`,
  `/${YEAR}/${MK}/${SK}/analysis/pace`,
  `/${YEAR}/${MK}/${SK}/analysis/strategy`,
  `/${YEAR}/${MK}/${SK}/analysis/battles`,
  `/${YEAR}/${MK}/${SK}/analysis/track`,
  `/${YEAR}/${MK}/${QSK}/analysis/overview`,
  `/${YEAR}/${MK}/${SK}/driver/${DN}/laps`,
  `/${YEAR}/${MK}/${SK}/driver/${DN}/telemetry`,
];
const WIDTHS = [390, 768, 1280];

function fileFor(route, width) {
  return (route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "_")) + `@${width}.png`;
}

async function capture(base, label) {
  const dir = join(outRoot, label);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        await page.goto(base + route, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
        // Let lazy data settle; the analysis page fetches after mount.
        await page.waitForTimeout(2500);
        await page.screenshot({ path: join(dir, fileFor(route, width)), fullPage: true });
        process.stdout.write(`  ${label}  ${String(width).padStart(4)}  ${route}\n`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return dir;
}

async function diff(a, b) {
  const { default: pixelmatch } = await import("pixelmatch");
  const { PNG } = await import("pngjs");
  const dirA = join(outRoot, a), dirB = join(outRoot, b);
  const outDir = join(outRoot, `${a}_vs_${b}`);
  mkdirSync(outDir, { recursive: true });
  let worst = 0;
  for (const f of readdirSync(dirA).filter(f => f.endsWith(".png"))) {
    if (!existsSync(join(dirB, f))) { console.log(`  missing in ${b}: ${f}`); continue; }
    const A = PNG.sync.read(readFileSync(join(dirA, f)));
    const B = PNG.sync.read(readFileSync(join(dirB, f)));
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const out = new PNG({ width: w, height: h });
    const cropped = img => {
      const c = new PNG({ width: w, height: h });
      for (let y = 0; y < h; y++) img.data.copy(c.data, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
      return c;
    };
    const n = pixelmatch(cropped(A).data, cropped(B).data, out.data, w, h, { threshold: 0.1 });
    const pct = (100 * n) / (w * h);
    worst = Math.max(worst, pct);
    writeFileSync(join(outDir, f.replace(".png", "-diff.png")), PNG.sync.write(out));
    console.log(`  ${pct.toFixed(2).padStart(6)}%  ${f}${A.height !== B.height ? `  (height ${A.height}→${B.height})` : ""}`);
  }
  console.log(`worst: ${worst.toFixed(2)}%  →  ${outDir}`);
}

async function main() {
  const d = args.indexOf("--diff");
  if (d >= 0) return diff(args[d + 1], args[d + 2]);

  const label = flag("--label") || execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const base = flag("--base");
  if (base) return capture(base.replace(/\/$/, ""), label);

  const port = 4173 + Math.floor(Math.random() * 500);
  const preview = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 2500));
    await capture(`http://localhost:${port}`, label);
  } finally {
    preview.kill();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
