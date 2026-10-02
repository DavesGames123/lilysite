// Render content/profile.json into the marked regions of public/index.html.
//
// The renderer is public/js/render.js, the same module that the in-page
// editor uses. The page stays static HTML, so the résumé reads without
// JavaScript and prints cleanly.
//
// Usage:
//   node scripts/render_content.mjs           # rewrite public/index.html
//   node scripts/render_content.mjs --check   # exit 1 if the page is stale
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REGIONS, renderPage } from "../public/js/render.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content/profile.json");
const PAGE = join(ROOT, "public/index.html");

const data = JSON.parse(readFileSync(CONTENT, "utf8"));
const current = readFileSync(PAGE, "utf8");
const rendered = renderPage(current, data);
if (process.argv.includes("--check")) {
  if (rendered !== current) {
    console.log("index.html is stale: run node scripts/render_content.mjs");
    process.exit(1);
  }
  console.log("index.html matches content/profile.json");
} else {
  writeFileSync(PAGE, rendered);
  console.log(`rendered ${Object.keys(REGIONS).length} regions into public/index.html`);
}
