// Companion portrait (phones and tablets).
//
// The hero portrait stays in the page and scrolls natively. When the hero face
// leaves the screen, a small head-and-shoulders portrait rises into the
// lower-right corner on a soft red glow. It draws the same frame as the hero
// canvas (one frame, full opacity, a crop of the frame), so it follows the
// finger too. An IntersectionObserver on the face drives it: no scroll
// handlers and no layout reads during a scroll. Only opacity and transform
// change, so the browser runs the motion on the compositor. iOS toolbar
// resizes do not affect it. A tap on it scrolls to the top.

// Crop of the 9:16 frame, in frame fractions: head and shoulders.
const CROP = { x: 0.08, y: 0.0, w: 0.84, h: 0.64 };
const STACKED = "(max-width: 1023.98px)";

export class Companion {
  constructor({ root, canvas, faceTarget, faceCenter }) {
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.faceCenter = faceCenter;
    this.visible = false;
    this.enabled = true;
    this.image = null;
    this.stacked = window.matchMedia(STACKED);
    this.observer = new IntersectionObserver(([entry]) => this.onFace(entry), { threshold: [0, 0.35] });
    this.observer.observe(faceTarget);
    this.stacked.addEventListener("change", () => this.setVisible(this.visible));
    root.addEventListener("click", () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  onFace(entry) {
    // Show the companion once less than 35% of the face area is on screen,
    // and only after the face has scrolled up (not before the page is scrolled).
    const gone = entry.intersectionRatio < 0.35 && entry.boundingClientRect.top < 0;
    this.setVisible(gone);
  }

  setVisible(on) {
    this.visible = on;
    const show = on && this.enabled && this.stacked.matches;
    this.root.classList.toggle("is-visible", show);
    this.root.setAttribute("aria-hidden", show ? "false" : "true");
    this.root.tabIndex = show ? 0 : -1;
    if (show && this.image) this.paint(this.image);
  }

  get active() {
    return this.visible && this.enabled && this.stacked.matches;
  }

  // Called with every frame the hero renderer draws.
  draw(image) {
    this.image = image;
    if (this.active) this.paint(image);
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
