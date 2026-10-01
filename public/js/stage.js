// Scroll stage (wide screens): places the portrait and feeds the corner field.
//
// At min-width 1024px the portrait is a fixed layer (CSS). At the top of the
// page its center is at 2/3 of the window width. As the page scrolls through
// the first 70% of a window height, the portrait moves to a dock at the right
// edge and scales to --dock-scale. The move follows the scroll, eased and
// smoothed; with prefers-reduced-motion it snaps. onMove(rect) runs after each
// placement with the field rect, so the gaze tracks a still cursor and the
// corner field keeps her silhouette inside the red.
//
// Narrow screens do nothing here: the hero portrait stays in the page, and
// companion.js shows the small corner portrait.

const DOCK_QUERY = "(min-width: 1024px)";
const TRAVEL = 0.7; // window heights of scroll for the full desktop move
const SMOOTH = 0.16; // per 60 Hz frame

export class ScrollStage {
  constructor({ figure, field, onMove }) {
    this.figure = figure;
    this.field = field;
    this.onMove = onMove;
    this.dock = window.matchMedia(DOCK_QUERY);
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.progress = 0;
    this.raf = 0;
    this.last = 0;
    const schedule = () => this.schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    // A resize only reschedules. iOS fires resize when its toolbar collapses
    // during a scroll, so a reset here would make the layout jump.
    window.addEventListener("resize", schedule, { passive: true });
    this.dock.addEventListener("change", () => this.applyLayout());
    this.reduced.addEventListener("change", schedule);
    this.applyLayout();
  }

  applyLayout() {
    this.figure.style.transform = "";
    this.progress = this.desktopTarget();
    this.schedule();
  }

  schedule() {
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  frame(now) {
    this.raf = 0;
    if (!this.dock.matches) return;
    this.frameDesktop(now);
    this.onMove?.(this.field.getBoundingClientRect());
  }

  desktopTarget() {
    const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * TRAVEL)));
    return this.reduced.matches ? (p < 0.5 ? 0 : 1) : p;
  }

  frameDesktop(now) {
    const dt = this.last ? Math.min(64, now - this.last) : 16.67;
    this.last = now;
    const goal = this.desktopTarget();
    if (this.reduced.matches) this.progress = goal;
    else {
      this.progress += (goal - this.progress) * (1 - Math.pow(1 - SMOOTH, dt / 16.67));
      if (Math.abs(goal - this.progress) < 0.0005) this.progress = goal;
    }
    this.placeDesktop(ease(this.progress));
    if (this.progress !== goal) this.schedule();
    else this.last = 0;
  }

  placeDesktop(t) {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const fw = this.figure.offsetWidth;
    const fh = this.figure.offsetHeight;
    const root = getComputedStyle(document.documentElement);
    const dockScale = parseFloat(root.getPropertyValue("--dock-scale")) || 0.8;
    const gap = this.dockGap(root);
    const scale = 1 + (dockScale - 1) * t;
    const homeX = W * (2 / 3);
    const dockX = W - gap - (fw * dockScale) / 2;
    const homeY = H / 2 + 24; // clears the masthead
    const dockY = H / 2;
    const cx = homeX + (dockX - homeX) * t;
    const cy = homeY + (dockY - homeY) * t;
    this.setTransform(cx - (fw * scale) / 2, cy - (fh * scale) / 2, scale);
  }

  dockGap(root) {
    // --dock-gap is a clamp() expression; resolve it through a probe element.
    if (this.gapProbe === undefined) {
      this.gapProbe = document.createElement("div");
      this.gapProbe.style.cssText = "position:absolute;visibility:hidden;width:var(--dock-gap)";
      document.body.appendChild(this.gapProbe);
    }
    return this.gapProbe.offsetWidth || parseFloat(root.getPropertyValue("--dock-gap")) || 48;
  }

  setTransform(x, y, scale) {
    this.figure.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  }
}

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
