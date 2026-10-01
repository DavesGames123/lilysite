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
import { Companion } from "./companion.js";

const APPROVED_PORTRAIT = "/assets/lily/lily_stylized_approved.png";
const RING_FACE = [0.5, 0.36];
const RESPONSE = 0.26; // per 60 Hz frame, corrected for frame time below
const RETURN_MS = 420; // duration of the recorded up <-> eye-contact move
const UP_SNAP = 0.07; // rad: close enough to the up pose to start the drop
const TAU = Math.PI * 2;

const figure = document.getElementById("portrait");
const field = document.getElementById("portrait-field");
const cues = document.querySelectorAll("[data-portrait-cue]");
const renderer = new PortraitRenderer(document.getElementById("portrait-canvas"), null);
const css = getComputedStyle(document.documentElement);
const companion = new Companion({
  root: document.getElementById("companion"),
  canvas: document.getElementById("companion-canvas"),
  faceTarget: document.getElementById("portrait-face"),
  faceCenter: RING_FACE,
  heroField: field,
  heroFigure: figure,
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
  // lift: 0 = eye contact, 1 = on the ring. Between them, the recorded return
  // frames play (index 0 = up, last = nearly eye contact). Never blended.
  lift: 0,
  returnImages: null,
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
  const alt = document.getElementById("portrait-alt")?.textContent;
  if (alt) field.setAttribute("aria-label", alt);
  if (cue) cues.forEach((el) => { el.textContent = cue; });
}

const stage = new ScrollStage({
  figure,
  field,
  onMove: () => state.controller?.refresh(),
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

function drawReturn(lift) {
  const frames = state.returnImages;
  const i = Math.min(frames.length - 1, Math.max(0, Math.round((1 - lift) * (frames.length - 1))));
  if (renderer.draw(frames[i], `r${i}`)) state.index = `r${i}`;
}

// Steer the ring angle toward `goal`; returns the remaining delta.
function steer(goal, dt) {
  const delta = shortestDelta(state.current, goal);
  state.current += delta * (1 - Math.pow(1 - RESPONSE, dt / 16.67));
  drawRing(angleToIndex(state.current));
  return delta;
}

function tick(now) {
  state.raf = 0;
  const dt = state.last ? Math.min(64, now - state.last) : 16.67;
  state.last = now;
  const animated = state.returnImages && !reducedMotion.matches;
  const up = state.ring.offsetRad;
  let moving;
  if (!animated) {
    // No recorded return (or reduced motion): change pose directly.
    if (state.center) { state.lift = 0; drawCenter(); moving = false; }
    else { state.lift = 1; moving = Math.abs(steer(state.target, dt)) > 0.002; }
  } else if (state.center) {
    if (state.lift >= 1) {
      // Swing along the ring to the up pose, then drop into eye contact.
      const delta = steer(up, dt);
      if (Math.abs(delta) < UP_SNAP && angleToIndex(state.current) === 0) state.lift = 0.999;
      moving = true;
    } else {
      state.lift = Math.max(0, state.lift - dt / RETURN_MS);
      if (state.lift === 0) drawCenter(); else drawReturn(state.lift);
      moving = state.lift > 0;
    }
  } else if (state.lift < 1) {
    // Leave eye contact the same way: lift to the up pose, then turn.
    state.lift = Math.min(1, state.lift + dt / RETURN_MS);
    state.current = up;
    if (state.lift === 1) drawRing(0); else drawReturn(state.lift);
    moving = true;
  } else {
    moving = Math.abs(steer(state.target, dt)) > 0.002;
  }
  // Frames that load later reschedule through store.onLoad, so no busy wait occurs here.
  if (moving) schedule();
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
  if (!target.center) queueBackground();
  if (target.center) {
    state.center = true;
  } else {
    // Without the recorded return, leave eye contact straight toward the new
    // angle. With it, tick() lifts through the up pose first.
    if (state.center && !(state.returnImages && !reducedMotion.matches)) state.current = target.angle;
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
    setMode("reduced", "Motion reduced — portrait holds eye contact");
  } else {
    state.controller.enable();
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
  companion.enabled = false; // the square still does not fill the 9:16 field
  stage.schedule();
  setMode("fallback", image ? "Still portrait — animation frames not installed" : "Portrait unavailable");
}

// The metadata and center frame loaded, but the ring frames fail. Hold eye
// contact and stop the claim that Lily follows the cursor.
function startStill() {
  state.still = true;
  state.controller.disable();
  state.center = true;
  drawCenter();
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
  }
  figure.dataset.alpha = ring.meta.alpha ? "true" : "false";
  companion.faceCenter = ring.faceCenter;
  stage.schedule();

  renderer.resize(ring.width, ring.height);
  drawCenter();
  // The return frames load right after the center frame; until then, poses change directly.
  if (ring.returnUrls.length) {
    Promise.all(ring.returnUrls.map((u) => decodeImage(u)))
      .then((images) => { state.returnImages = images; })
      .catch(() => {});
  }
  applyMotionPreference();
  reducedMotion.addEventListener("change", applyMotionPreference);
}

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
    lift: state.lift,
    failed: state.store?.failed.size ?? 0,
  }),
});

start();
