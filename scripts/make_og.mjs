// Capture the social card (public/icons/og-image.jpg, 1200x630): the real hero,
// Lily's face in the studio arch beside her name. Needs the site on :4173 and Chrome.
//   node scripts/make_og.mjs [--url http://localhost:4173/]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:4173/";
const PORT = 9400 + Math.floor(Math.random() * 300), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "og-"))}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let url; for (let i = 0; i < 60 && !url; i++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(150); }
const ws = new WebSocket(url); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
// A 1200x630 window at 2x, so the portrait docks at its home position and text stays sharp.
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 2, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.enable"); await send("Page.navigate", { url: BASE }); await sleep(3500);
// Hide the nav and the about line: they do not read at card size.
await send("Runtime.evaluate", { expression: `document.querySelectorAll(".masthead nav, .about-line, .hero-links").forEach(e => e.style.visibility = "hidden"); document.fonts.ready` , awaitPromise: true });
await sleep(400);
const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 0.5 } });
writeFileSync("public/icons/og-image.jpg", Buffer.from(data, "base64"));
console.log("public/icons/og-image.jpg written");
ws.close(); chrome.kill(); process.exit(0);
