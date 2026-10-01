// Browser checks for the portrait and layout, run in headless Chrome over CDP.
// It needs no dependencies: Node 22+ (global WebSocket) and an installed Chrome.
//
// Usage:
//   python3 -m http.server 4173 -d public &
//   node scripts/verify_browser.mjs [--url http://localhost:4173/] [--shots DIR]
//
// Each check prints PASS or FAIL. The exit code is the number of failures.

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("--url", "http://localhost:4173/");
const SHOTS = arg("--shots", null);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9300 + Math.floor(Math.random() * 400);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "lily-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const waiting = new Map();
const events = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) events.push(msg);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const portrait = () => evaluate("window.__portrait");
async function waitFor(fn, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(60);
  }
  return null;
}

// Counts drawImage calls on the foreground canvas per animation frame, and records any alpha below 1.
const INSTRUMENT = `
  window.__drawAudit = { maxPerFrame: 0, current: 0, lowAlpha: 0, total: 0 };
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    if (this.canvas && this.canvas.id === "portrait-canvas") {
      const audit = window.__drawAudit;
      audit.current += 1; audit.total += 1;
      if (this.globalAlpha < 1) audit.lowAlpha += 1;
    }
    return orig.apply(this, a);
  };
  const loop = () => { const a = window.__drawAudit; a.maxPerFrame = Math.max(a.maxPerFrame, a.current); a.current = 0; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
`;

async function open(url, { width, height, mobile = false, dpr = 1, reduced = false } = {}) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  events.length = 0;
  await send("Page.navigate", { url });
  await waitFor(async () => (await evaluate("document.readyState")) === "complete");
  await waitFor(async () => (await portrait())?.mode !== "loading", 8000);
}

async function shot(name, full = false) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const params = { format: "png" };
  if (full) {
    const { cssContentSize } = await send("Page.getLayoutMetrics");
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
  }
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
}

async function fieldRect() {
  return evaluate(`(() => { const r = document.getElementById("portrait-field").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
}
async function face() {
  const r = await fieldRect();
  const meta = await evaluate(`fetch("/frames/metadata.json").then(r => r.json())`);
  return { r, meta, cx: r.x + r.w * meta.face_center_normalized[0], cy: r.y + r.h * meta.face_center_normalized[1] };
}
const expectedIndex = (meta, deg) => {
  const steps = Math.round((((deg - meta.angle_offset_degrees) % 360 + 540) % 360 - 180) / meta.angle_step_degrees);
  return ((steps % meta.frame_count) + meta.frame_count) % meta.frame_count;
};
const settle = async (want) => waitFor(async () => {
  const p = await portrait();
  return p.drawn === want ? p : null;
}, 4000);

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });

  // 1. Desktop load
  await open(BASE, { width: 1440, height: 900 });
  let p = await portrait();
  check(p.mode === "ring", "desktop: frame-ring mode active", `mode=${p.mode}`);
  check(p.drawn === "center", "desktop: first draw is center.webp (eye contact)", `drawn=${p.drawn}`);
  const errors = events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
  check(errors.length === 0, "desktop: no console errors", errors.map((e) => JSON.stringify(e.params).slice(0, 160)).join(" | "));
  const failed = events.filter((e) => e.method === "Network.responseReceived" && e.params.response.status >= 400);
  check(failed.length === 0, "desktop: no failed requests", failed.map((e) => `${e.params.response.status} ${e.params.response.url}`).join(", "));
  const ratio = await evaluate(`(() => { const c = document.getElementById("portrait-canvas"); const r = c.getBoundingClientRect(); return [c.width / c.height, r.width / r.height]; })()`);
  check(Math.abs(ratio[0] - 9 / 16) < 0.002 && Math.abs(ratio[1] - 9 / 16) < 0.01, "desktop: canvas keeps 9:16 (pixels and CSS box)", ratio.map((v) => v.toFixed(4)).join(" / "));
  const corners = await evaluate(`(() => { const c = document.getElementById("portrait-canvas"); const x = c.getContext("2d"); const px = (a, b) => x.getImageData(a, b, 1, 1).data[3]; return [px(4, 4), px(c.width - 5, 4), px(4, c.height / 2), px(c.width / 2, c.height / 2)]; })()`);
  check(corners[0] === 0 && corners[1] === 0 && corners[2] === 0 && corners[3] === 255, "cutout: frame corners transparent, face opaque (no rectangle)", JSON.stringify(corners));
  // Studio red: an arch of the video red behind her silhouette, black elsewhere.
  const studio = await evaluate(`(() => {
    const f = document.getElementById("portrait-field").getBoundingClientRect();
    const r = document.querySelector(".studio-red").getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector(".studio-red"));
    return { covers: r.left < f.left && r.right > f.right && r.top < f.top, bg: cs.backgroundColor, body: getComputedStyle(document.documentElement).backgroundColor };
  })()`);
  check(studio.covers && /212, 30, 18/.test(studio.bg) && /11, 10, 13/.test(studio.body), "studio: red arch behind the silhouette, black page", JSON.stringify(studio));
  await shot("desktop-hero");

  // 2. Pointer direction maps to the expected ring frame
  const { meta, cx, cy, r } = await face();
  const far = r.h * 0.45;
  for (const [label, deg] of [["right", 0], ["down", 90], ["left", 180], ["up", -90], ["up-right", -45]]) {
    const rad = (deg * Math.PI) / 180;
    // Keep the probe inside the 1440x900 viewport, on the same ray.
    const room = Math.min(far, ...[[Math.cos(rad), cx, 1440], [Math.sin(rad), cy, 900]].map(([c, o, max]) => (Math.abs(c) < 1e-6 ? Infinity : (c > 0 ? max - 4 - o : o - 4) / Math.abs(c))));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + Math.cos(rad) * room, y: cy + Math.sin(rad) * room });
    const want = expectedIndex(meta, deg);
    const got = await settle(want);
    check(Boolean(got), `pointer ${label}: frame ${want} (${meta.frames[want].angle_degrees}°)`, `drawn=${(await portrait()).drawn}`);
  }
  if (SHOTS) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx - far, y: cy });
    await settle(expectedIndex(meta, 180));
    await shot("desktop-look-left");
  }

  // 3. Dead zone gives eye contact
  const dz = Math.max(r.w, r.h) / 2 * meta.center_deadzone_fraction_of_radius;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + dz * 0.6, y: cy });
  check(Boolean(await settle("center")), "dead zone: center.webp inside 12% radius", `radius=${dz.toFixed(1)}px`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + dz * 1.6, y: cy });
  check(Boolean(await settle(expectedIndex(meta, 0))), "dead zone: ring frame just outside the radius");

  // 4. One draw per animation frame, never blended
  const audit = await evaluate("window.__drawAudit");
  check(audit.maxPerFrame <= 1, "renderer: at most one drawImage per animation frame", JSON.stringify(audit));
  check(audit.lowAlpha === 0, "renderer: every frame drawn at 100% opacity");

  // 4b. Layout: 2/3 position at the top, right dock after scroll, gradient follows
  const W = 1440;
  let fr = await fieldRect();
  check(Math.abs((fr.x + fr.w / 2) / W - 2 / 3) < 0.02, "layout: portrait centered at 2/3 of the width", `center=${((fr.x + fr.w / 2) / W).toFixed(3)}`);
  await evaluate(`window.scrollTo({ top: document.getElementById("experience").offsetTop - 80, behavior: "instant" })`);
  await sleep(1400);
  fr = await fieldRect();
  const rail = await evaluate(`(() => { const r = document.querySelector("#experience .timeline").getBoundingClientRect(); return r.right; })()`);
  check(fr.x + fr.w > W - 80 && fr.x + fr.w <= W, "scroll: portrait docks at the right edge", `right=${(fr.x + fr.w).toFixed(0)}`);
  check(rail < fr.x, "scroll: résumé text stays clear of the docked portrait", `text right=${rail.toFixed(0)} portrait left=${fr.x.toFixed(0)}`);

  const sc = { cx: fr.x + fr.w * meta.face_center_normalized[0], cy: fr.y + fr.h * meta.face_center_normalized[1] };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc.cx - 400, y: sc.cy });
  check(Boolean(await settle(expectedIndex(meta, 180))), "scroll: docked portrait still follows the cursor (left)");
  await shot("desktop-docked");
  // A still cursor: scrolling moves the face under it, and the gaze updates.
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sc.cx, y: 40 });
  await settle(expectedIndex(meta, -90));
  await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(1400);
  const back = await face();
  const wantBack = expectedIndex(meta, (Math.atan2(40 - back.cy, sc.cx - back.cx) * 180) / Math.PI);
  check(Boolean(await settle(wantBack)), "scroll: gaze re-aims at a still cursor as the portrait moves", `want=${wantBack} drawn=${(await portrait()).drawn}`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: back.cx, y: back.cy });
  await settle("center");

  // 5. Keyboard: arrows point the gaze, Escape resets, the reset button resets
  await evaluate(`document.getElementById("portrait-field").focus()`);
  const key = (type, k, code) => send("Input.dispatchKeyEvent", { type, key: k, code: code || k, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27 }[k] });
  await key("keyDown", "ArrowLeft"); await key("keyUp", "ArrowLeft");
  check(Boolean(await settle(expectedIndex(meta, 180))), "keyboard: ArrowLeft looks left");
  await key("keyDown", "ArrowDown"); await key("keyDown", "ArrowRight"); await key("keyUp", "ArrowDown"); await key("keyUp", "ArrowRight");
  check(Boolean(await settle(expectedIndex(meta, 45))), "keyboard: ArrowDown+ArrowRight looks down-right");
  await key("keyDown", "Escape"); await key("keyUp", "Escape");
  check(Boolean(await settle("center")), "keyboard: Escape returns to eye contact");
  await key("keyDown", "ArrowUp"); await key("keyUp", "ArrowUp");
  await settle(expectedIndex(meta, -90));
  await evaluate(`document.getElementById("portrait-reset").click()`);
  check(Boolean(await settle("center")), "reset button returns to eye contact");
  const focusRing = await evaluate(`(() => { const f = document.getElementById("portrait-field"); return document.activeElement === f && getComputedStyle(f).outlineStyle !== "none"; })()`);
  check(focusRing, "keyboard: portrait shows a visible focus outline");

  // 6. Mobile layout and touch
  await open(BASE, { width: 390, height: 844, mobile: true, dpr: 2 });
  p = await portrait();
  check(p.mode === "ring" && p.drawn === "center", "mobile: ring mode, center frame", `mode=${p.mode} drawn=${p.drawn}`);
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  check(overflow <= 0, "mobile: no horizontal overflow", `overflow=${overflow}px`);
  await shot("mobile-hero");
  const mf = await face();
  const tp = { x: mf.cx, y: mf.cy - mf.r.h * 0.35 };
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tp.x + 1, y: tp.y }] });
  check(Boolean(await settle(expectedIndex(mf.meta, -90))), "touch: drag above the face looks up", `drawn=${(await portrait()).drawn}`);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  check(Boolean(await settle("center")), "touch: lifting the finger returns to eye contact");
  const mr = await fieldRect();
  check(Math.abs(mr.w - 390) < 1 && mr.y + mr.h * 0.36 < 844 * 0.5, "mobile: full-bleed portrait, face in the top half of the first screen", `w=${mr.w.toFixed(0)} faceY=${(mr.y + mr.h * 0.36).toFixed(0)}`);
  await evaluate(`window.scrollTo({ top: document.getElementById("experience").offsetTop, behavior: "instant" })`);
  await sleep(120);
  const flight = await evaluate(`(() => { const t = new DOMMatrix(getComputedStyle(document.getElementById("companion")).transform); return { scale: t.a, handed: document.getElementById("portrait").classList.contains("is-handed-off") }; })()`);
  check(flight.scale > 1.2 && flight.handed, "mobile scroll: portrait travels from the hero toward the corner (starts large, hero handed off)", JSON.stringify(flight));
  await sleep(1000);
  p = await portrait();
  const comp = await evaluate(`(() => { const e = document.getElementById("companion"), r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { x: r.left, y: r.top, w: r.width, h: r.height, o: cs.opacity, heroPos: getComputedStyle(document.getElementById("portrait")).position }; })()`);
  check(p.companion && comp.o === "1" && comp.x + comp.w <= 390 && comp.x > 390 / 2 && comp.y + comp.h <= 844 && comp.y > 844 / 2,
    "mobile scroll: companion portrait appears in the lower-right corner", JSON.stringify(comp));
  check(comp.heroPos === "absolute", "mobile scroll: hero portrait stays in the page (not fixed)", comp.heroPos);
  await shot("mobile-companion");
  const cf = await evaluate(`(() => { const r = document.getElementById("companion-canvas").getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * (0.36 / 0.64) }; })()`);
  const meta2 = await evaluate(`fetch("/frames/metadata.json").then(r => r.json())`);
  const touchAt = { x: 30, y: 200 };
  const wantTouch = expectedIndex(meta2, (Math.atan2(touchAt.y - cf.y, touchAt.x - cf.x) * 180) / Math.PI);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchAt] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchAt.x + 1, y: touchAt.y }] });
  check(Boolean(await settle(wantTouch)), "mobile scroll: companion follows the finger from its own face", `want=${wantTouch} drawn=${(await portrait()).drawn}`);
  const compPixel = await evaluate(`(() => { const c = document.getElementById("companion-canvas"); return c.getContext("2d").getImageData(c.width / 2, c.height * 0.5, 1, 1).data[3]; })()`);
  check(compPixel === 255, "mobile scroll: companion canvas shows the current frame", `alpha=${compPixel}`);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(1000);
  p = await portrait();
  const heroBack = await fieldRect();
  const heroCanvas = await evaluate(`getComputedStyle(document.getElementById("portrait-canvas")).visibility`);
  check(!p.companion && Math.abs(heroBack.y) < 2 && heroCanvas === "visible", "mobile scroll: portrait travels back and the hero canvas returns", `companion=${p.companion} heroY=${heroBack.y.toFixed(1)} canvas=${heroCanvas}`);
  await shot("mobile-full", true);

  // 7. Reduced motion
  await open(BASE, { width: 1440, height: 900, reduced: true });
  const rf = await face();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rf.cx + 300, y: rf.cy });
  await sleep(500);
  p = await portrait();
  check(p.mode === "reduced" && p.drawn === "center" && p.loaded === 0, "reduced motion: center only, no ring frames loaded", JSON.stringify(p));
  const anim = await evaluate(`getComputedStyle(document.querySelector(".studio-red")).animationName`);
  check(anim === "none", "reduced motion: studio arch does not breathe", anim);
  check(await evaluate(`document.getElementById("portrait-reset").hidden`), "reduced motion: reset control hidden");

  // 7b. Metadata and center frame present, ring frames absent (404)
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/frames/frame_*" }] });
  const onPaused = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Fetch.requestPaused") send("Fetch.fulfillRequest", { requestId: msg.params.requestId, responseCode: 404, body: "" }).catch(() => {});
  };
  ws.addEventListener("message", onPaused);
  await open(BASE, { width: 1440, height: 900 });
  const sf = await face();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sf.cx - 200, y: sf.cy });
  p = await waitFor(async () => { const q = await portrait(); return q.mode === "still" ? q : null; }, 6000) || await portrait();
  const stillCue = await evaluate(`document.getElementById("portrait-cue-text").textContent`);
  check(p.mode === "still" && p.drawn === "center", "missing ring frames: holds center, mode still", JSON.stringify(p));
  check(!/follows/i.test(stillCue), "missing ring frames: page does not claim animation", `cue="${stillCue}"`);
  const before = events.filter((e) => e.method === "Fetch.requestPaused").length;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sf.cx + 200, y: sf.cy });
  await sleep(600);
  const after = events.filter((e) => e.method === "Fetch.requestPaused").length;
  check(after === before, "missing ring frames: failed frames are not requested again", `${before} -> ${after}`);
  ws.removeEventListener("message", onPaused);
  await send("Fetch.disable");
  await send("Network.setCacheDisabled", { cacheDisabled: false });

  // 8. Fallback path
  await open(`${BASE}?portrait=static`, { width: 1440, height: 900 });
  p = await portrait();
  const cue = await evaluate(`document.getElementById("portrait-cue-text").textContent`);
  const png = events.some((e) => e.method === "Network.responseReceived" && e.params.response.url.endsWith("lily_stylized_approved.png") && e.params.response.status === 200);
  check(p.mode === "fallback" && p.drawn === "static", "fallback: approved portrait drawn", JSON.stringify(p));
  check(png, "fallback: lily_stylized_approved.png loads (200)");
  check(/still portrait/i.test(cue) && !/follows/i.test(cue), "fallback: page does not claim animation", `cue="${cue}"`);
  const resetHidden = await evaluate(`document.getElementById("portrait-reset").hidden`);
  check(resetHidden, "fallback: reset control hidden");
  await shot("desktop-fallback");

  // 8b. Print: a two-page résumé with the headshot
  await open(BASE, { width: 1440, height: 900 });
  await evaluate(`document.fonts.ready.then(() => true)`);
  const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
  const bytes = Buffer.from(pdf.data, "base64");
  const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(pages === 2, "print: résumé prints on exactly 2 pages", `pages=${pages}`);
  const photo = await evaluate(`(() => { const i = document.querySelector(".ps-photo img"); return i.complete && i.naturalWidth > 0; })()`);
  check(photo, "print: headshot image loaded");
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, "resume.pdf"), bytes);
  }

  // 9. Full desktop page
  await open(BASE, { width: 1440, height: 900 });
  await shot("desktop-full", true);
} catch (error) {
  failures += 1;
  console.log(`FAIL  harness error — ${error.message}`);
} finally {
  ws.close();
  chrome.kill();
}
console.log(`\n${failures === 0 ? "all browser checks passed" : `${failures} browser check(s) failed`}`);
process.exit(failures);
