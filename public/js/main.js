// Portrait player: joins the manifest, renderer, and controller.
//
// Modes (shown on #portrait[data-mode]):
//   loading   nothing is drawn yet; CSS shows the flat red field
//   ring      video-derived frames: one frame per animation frame, no blending
//   reduced   prefers-reduced-motion: center frame only, no input
//   still     the center frame loaded but the ring frames fail: center only,
//             and the page says that the animation frames are not installed
//   fallback  FALLBACK PATH: frames or metadata are absent, so the approved
//             still portrait is drawn and the page says so
//
// Force the fallback path for testing with ?portrait=static.

import { FrameStore, decodeImage, loadManifest } from "./manifest.js";
import { PointerController } from "./controller.js";
import { PortraitRenderer } from "./renderer.js";
import { ScrollStage } from "./stage.js";
import { CornerField, LivingSurface } from "./surface.js";
import { Companion } from "./companion.js";

const APPROVED_PORTRAIT = "/assets/lily/lily_stylized_approved.png";
const RING_FACE = [0.5, 0.36];
const RESPONSE = 0.26; // per 60 Hz frame, corrected for frame time below
const TAU = Math.PI * 2;

const figure = document.getElementById("portrait");
const field = document.getElementById("portrait-field");
const cues = document.querySelectorAll("[data-portrait-cue]");
const resetButton = document.getElementById("portrait-reset");
const renderer = new PortraitRenderer(document.getElementById("portrait-canvas"), null);
const css = getComputedStyle(document.documentElement);
const colors = {
  red: css.getPropertyValue("--red-field").trim() || "rgb(212,30,18)",
  brown1: css.getPropertyValue("--brown-1").trim() || "#8e2214",
  brown2: css.getPropertyValue("--brown-2").trim() || "#4d1a10",
  brown3: css.getPropertyValue("--brown-3").trim() || "#1d0f0b",
};
// Phones: a red column behind the hero portrait. Wide screens: red from the
// top-right corner of the window. CSS shows one of the two.
const surface = new LivingSurface({
  canvas: document.getElementById("portrait-surface"),
  contour: document.getElementById("portrait-contour-path"),
  colors,
});
const corner = new CornerField({
  canvas: document.getElementById("page-surface-canvas"),
  contour: document.getElementById("page-contour-path"),
  colors,
});
const companion = new Companion({
  root: document.getElementById("companion"),
  canvas: document.getElementById("companion-canvas"),
  faceTarget: document.getElementById("portrait-face"),
  faceCenter: RING_FACE,
});
// Every frame the hero canvas draws also goes to the companion (the same
// single frame, cropped), so the small portrait follows the finger too.
const drawOne = renderer.draw.bind(renderer);
renderer.draw = (image, key) => {
  const drawn = drawOne(image, key);
  if (drawn) companion.draw(image);
  return drawn;
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  ring: null,
  store: null,
  centerImage: null,
  controller: null,
  center: true,
  target: 0,
  current: 0,
  index: null,
  requested: null,
  backgroundQueued: false,
  raf: 0,
  last: 0,
};

const shortestDelta = (from, to) => ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

function angleToIndex(angle) {
  const { offsetRad, stepRad, count } = state.ring;
  const steps = Math.round(shortestDelta(offsetRad, angle) / stepRad);
  return ((steps % count) + count) % count;
}

function setMode(mode, cue) {
  figure.dataset.mode = mode;
  document.body.dataset.portraitMode = mode;
  field.setAttribute("aria-label", document.getElementById("portrait-alt").textContent);
  if (cue) cues.forEach((el) => { el.textContent = cue; });
}

const stage = new ScrollStage({
  figure,
  field,
  onMove: (rect) => {
    state.controller?.refresh();
    corner.setPortrait(rect);
  },
});

function drawCenter() {
  if (renderer.draw(state.centerImage, "center")) state.index = "center";
}

function drawRing(index) {
  if (state.requested !== index) {
    state.requested = index;
    state.store.prioritize(index);
  }
  const hit = state.store.has(index) ? { index, image: state.store.images[index] } : state.store.nearestLoaded(index);
  if (hit && renderer.draw(hit.image, hit.index)) state.index = hit.index;
}

function tick(now) {
  state.raf = 0;
  const dt = state.last ? Math.min(64, now - state.last) : 16.67;
  state.last = now;
  if (state.center) {
    drawCenter();
    state.last = 0;
    return;
  }
  const delta = shortestDelta(state.current, state.target);
  const k = 1 - Math.pow(1 - RESPONSE, dt / 16.67);
  state.current += delta * k;
  drawRing(angleToIndex(state.current));
  // Frames that load later reschedule through store.onLoad, so no busy wait occurs here.
  if (Math.abs(delta) > 0.002) schedule();
  else state.last = 0;
}

function schedule() {
  if (!state.raf) state.raf = requestAnimationFrame(tick);
}

// Load the remaining ring frames lazily: at idle time, or at the first input.
function queueBackground() {
  if (state.backgroundQueued || !state.store) return;
  state.backgroundQueued = true;
  state.store.queueAll(state.requested ?? 0);
}

function onTarget(target) {
  surface.setGaze(target.center ? null : target.angle);
  corner.setGaze(target.center ? null : target.angle);
  if (!target.center) queueBackground();
  if (target.center) {
    state.center = true;
  } else {
    // Leave eye contact straight toward the new angle, not from a stale one.
    if (state.center) state.current = target.angle;
    state.center = false;
    state.target = target.angle;
  }
  schedule();
}

function applyMotionPreference() {
  if (!state.ring) return;
  if (state.still) return;
  if (reducedMotion.matches) {
    state.controller.disable();
    state.center = true;
    drawCenter();
    resetButton.hidden = true;
    setMode("reduced", "Motion reduced — portrait holds eye contact");
  } else {
    state.controller.enable();
    resetButton.hidden = false;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    idle(queueBackground, { timeout: 4000 });
    setMode("ring", matchMedia("(hover: none)").matches ? "Touch anywhere — Lily follows" : "Move your cursor — Lily follows");
  }
}

// FALLBACK PATH: no video-derived frames. Draw the approved still portrait and label it.
async function startFallback(reason) {
  console.info(`Portrait fallback: ${reason}`);
  const image = await decodeImage(APPROVED_PORTRAIT).catch(() => null);
  renderer.resize(864, 1536);
  figure.dataset.alpha = "false";
  if (image) renderer.drawStatic(image);
  companion.enabled = false; // the square still has no head-and-shoulders crop
  stage.schedule();
  resetButton.hidden = true;
  setMode("fallback", image ? "Still portrait — animation frames not installed" : "Portrait unavailable");
}

// The metadata and center frame loaded, but the ring frames fail. Hold eye
// contact and stop the claim that Lily follows the cursor.
function startStill() {
  state.still = true;
  state.controller.disable();
  state.center = true;
  drawCenter();
  resetButton.hidden = true;
  setMode("still", "Still portrait — animation frames not installed");
}

async function start() {
  if (new URLSearchParams(location.search).get("portrait") === "static") return startFallback("forced by ?portrait=static");
  const ring = await loadManifest();
  if (!ring) return startFallback("frames/metadata.json not found");
  const centerImage = await decodeImage(ring.centerUrl).catch(() => null);
  if (!centerImage) return startFallback(`${ring.centerUrl} not found`);

  state.ring = ring;
  state.centerImage = centerImage;
  state.store = new FrameStore(ring);
  state.store.onLoad = () => { if (!state.center) schedule(); };
  state.store.onFail = () => {
    if (!state.still && state.store.loadedCount === 0 && state.store.failed.size >= 3) startStill();
  };
  state.controller = new PointerController(field, {
    faceCenter: ring.faceCenter,
    deadzone: ring.deadzone,
    onTarget,
    getFace: () => (companion.active ? companion.face() : null),
  });
  if (ring.background) {
    const red = `rgb(${ring.background.join(",")})`;
    document.documentElement.style.setProperty("--red-field", red);
    surface.setColors({ red });
    corner.setColors({ red });
  }
  figure.dataset.alpha = ring.meta.alpha ? "true" : "false";
  companion.faceCenter = ring.faceCenter;
  stage.schedule();

  renderer.resize(ring.width, ring.height);
  drawCenter();
  applyMotionPreference();
  reducedMotion.addEventListener("change", applyMotionPreference);
}

resetButton.addEventListener("click", () => {
  onTarget({ center: true });
  field.focus({ preventScroll: true });
});
document.getElementById("print-page")?.addEventListener("click", () => window.print());

// Read-only snapshot for automated checks (see scripts/verify_browser.mjs).
Object.defineProperty(window, "__portrait", {
  get: () => ({
    mode: figure.dataset.mode,
    drawn: renderer.drawn,
    draws: renderer.draws,
    center: state.center,
    targetDeg: (state.target * 180) / Math.PI,
    loaded: state.store?.loadedCount ?? 0,
    companion: companion.active,
    failed: state.store?.failed.size ?? 0,
  }),
});

start();
