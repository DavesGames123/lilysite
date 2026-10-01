// Companion portrait (phones and tablets).
//
// The hero portrait stays in the page and scrolls natively. When the hero face
// leaves the screen, the portrait travels into the lower-right corner:
//
//   1. The companion appears exactly over the hero's head-and-shoulders crop
//      (same place, same size), and the hero canvas hides (.is-handed-off).
//      The two are the same frame, so the hand-off does not show.
//   2. The companion shrinks and moves into the corner (transform only).
//   3. When the face comes back, the companion travels back over the hero
//      crop, the hero canvas shows again, and the companion hides.
//
// The companion draws the same frame as the hero canvas (one frame, full
// opacity, a crop), so it follows the finger too. An IntersectionObserver on
// the face drives it: no scroll handlers. Only opacity and transform animate,
// so the motion runs on the compositor, and iOS toolbar resizes do not move
// it. With reduced motion, the swap has no travel. A tap scrolls to the top.

// Crop of the 9:16 frame, in frame fractions: head and shoulders.
const CROP = { x: 0.08, y: 0.0, w: 0.84, h: 0.64 };
const STACKED = "(max-width: 1023.98px)";
const TRAVEL_MS = 650;

export class Companion {
  constructor({ root, canvas, faceTarget, faceCenter, heroField, heroFigure }) {
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.faceCenter = faceCenter;
    this.heroField = heroField;
    this.heroFigure = heroFigure;
    this.visible = false;
    this.shown = false;
    this.enabled = true;
    this.image = null;
    this.timer = 0;
    this.stacked = window.matchMedia(STACKED);
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.observer = new IntersectionObserver(([entry]) => this.onFace(entry), { threshold: [0, 0.35] });
    this.observer.observe(faceTarget);
    this.stacked.addEventListener("change", () => this.setVisible(this.visible));
    root.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: this.reduced.matches ? "auto" : "smooth" });
    });
  }

  onFace(entry) {
    // Travel once less than 35% of the face area is on screen, and only after
    // the face has scrolled up (not before the page is scrolled).
    const gone = entry.intersectionRatio < 0.35 && entry.boundingClientRect.top < 0;
    this.setVisible(gone);
  }

  setVisible(on) {
    this.visible = on;
    const show = on && this.enabled && this.stacked.matches;
    if (show === this.shown) return;
    this.shown = show;
    this.root.setAttribute("aria-hidden", show ? "false" : "true");
    this.root.tabIndex = show ? 0 : -1;
    if (show) this.travelIn();
    else this.travelOut();
  }

  get active() {
    return this.shown;
  }

  // The transform that puts the companion over the hero's crop, from its
  // resting place in the corner (transform-origin 0 0).
  overHero() {
    const hero = this.heroField.getBoundingClientRect();
    const rest = this.restRect();
    const scale = (hero.width * CROP.w) / rest.width;
    const x = hero.left + hero.width * CROP.x - rest.left;
    const y = hero.top + hero.height * CROP.y - rest.top;
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  restRect() {
    const saved = this.root.style.transform;
    this.root.style.transform = "none";
    const r = this.root.getBoundingClientRect();
    this.root.style.transform = saved;
    return r;
  }

  travelIn() {
    clearTimeout(this.timer);
    if (this.image) this.paint(this.image);
    const root = this.root;
    root.classList.remove("is-travelling");
    root.style.transform = this.reduced.matches ? "none" : this.overHero();
    root.classList.add("is-visible");
    this.heroFigure.classList.add("is-handed-off");
    void root.offsetWidth; // commit the start position before the transition
    root.classList.add("is-travelling");
    root.style.transform = "none";
  }

  travelOut() {
    clearTimeout(this.timer);
    const root = this.root;
    const done = () => {
      root.classList.remove("is-visible", "is-travelling");
      root.style.transform = "";
      this.heroFigure.classList.remove("is-handed-off");
    };
    if (this.reduced.matches || !root.classList.contains("is-visible")) return done();
    root.classList.add("is-travelling");
    root.style.transform = this.overHero();
    this.timer = setTimeout(done, TRAVEL_MS);
  }

  // Called with every frame the hero renderer draws.
  draw(image) {
    this.image = image;
    if (this.shown) this.paint(image);
  }

  paint(image) {
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const { width: cw, height: ch } = this.canvas;
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "copy";
    this.ctx.drawImage(image, CROP.x * w, CROP.y * h, CROP.w * w, CROP.h * h, 0, 0, cw, ch);
    this.ctx.globalCompositeOperation = "source-over";
  }

  // Face center and radius on screen, for the gaze controller.
  face() {
    const r = this.canvas.getBoundingClientRect();
    const fx = (this.faceCenter[0] - CROP.x) / CROP.w;
    const fy = (this.faceCenter[1] - CROP.y) / CROP.h;
    return { x: r.left + r.width * fx, y: r.top + r.height * fy, radius: Math.max(r.width, r.height) / 2 };
  }
}
