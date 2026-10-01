// Living surface behind the portrait cutout.
//
// The surface is a tall red column in the exact red of the video background.
// It rises from above the window, runs behind Lily's head and shoulders, and
// falls through brown to transparent below her chest. The cutout's soft edge
// pixels came from that same red, so they land red-on-red and do not show.
//
// Two layers share one box (field units: x -0.6..1.6, y -1.1..1.1, where the
// 9:16 field is 0..1 on each axis):
//   1. A low-resolution canvas, softened with a CSS blur: the red column.
//   2. An SVG path: a fine gold contour along the column's sides and base.
// The sides breathe slowly (low-frequency sines) and lean a little toward the
// gaze. With prefers-reduced-motion, the surface draws once and holds.

const FPS = 30;
const BOX = { x0: -0.6, x1: 1.6, y0: -1.1, y1: 1.1 }; // the CSS box, in field units
const HALF_WIDTH = 0.74; // column half-width, field widths (the hair reaches 0.5)
const BASE_Y = 0.62; // where the base curve starts, field heights
const BASE_DEPTH = 0.3; // depth of the base curve, field heights
const STEPS = 64;
const SOFTEN = 4; // the shape is drawn at 1/SOFTEN of the canvas size, then scaled up

// Softness without a CSS filter: the shape goes into a tiny canvas, and two
// bilinear scale-ups (tiny -> canvas -> CSS size) blur the edge. A CSS blur on a
// large layer that redraws 30 times a second is too heavy for phones.
function makeTiny(canvas) {
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(4, Math.round(canvas.width / SOFTEN));
  tiny.height = Math.max(4, Math.round(canvas.height / SOFTEN));
  return tiny;
}

function present(canvas, tiny) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);
}

export class LivingSurface {
  constructor({ canvas, contour, colors }) {
    this.canvas = canvas;
    this.tiny = makeTiny(canvas);
    this.ctx = this.tiny.getContext("2d");
    this.contour = contour;
    this.colors = colors;
    this.lean = { x: 0, y: 0 };
    this.leanTarget = { x: 0, y: 0 };
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.raf = 0;
    this.last = 0;
    this.t = 0;
    this.reduced.addEventListener("change", () => this.start());
    document.addEventListener("visibilitychange", () => this.start());
    this.start();
  }

  setGaze(angle) {
    this.leanTarget = angle == null ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) };
    if (this.reduced.matches) this.draw();
  }

  setColors(colors) {
    this.colors = { ...this.colors, ...colors };
    this.draw();
  }

  start() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.draw();
    if (!this.reduced.matches && !document.hidden) this.raf = requestAnimationFrame((now) => this.loop(now));
  }

  loop(now) {
    this.raf = requestAnimationFrame((n) => this.loop(n));
    if (now - this.last < 1000 / FPS) return;
    if (!this.canvas.getClientRects().length) return; // hidden by the layout
    const dt = this.last ? Math.min(100, now - this.last) : 33;
    this.last = now;
    this.t += dt / 1000;
    const k = 1 - Math.pow(0.9, dt / 33);
    this.lean.x += (this.leanTarget.x - this.lean.x) * k;
    this.lean.y += (this.leanTarget.y - this.lean.y) * k;
    this.draw();
  }

  // Half-width of the column at height y (field units) on one side (+1 right, -1 left).
  side(y, dir, t, grow) {
    const breathe = 0.035 * Math.sin(y * 3.1 + t * 0.42 + dir) + 0.022 * Math.sin(y * 5.3 - t * 0.31 + 2 * dir) + 0.012 * Math.sin(t * 0.6 + dir * 1.7);
    return (HALF_WIDTH + breathe) * grow + dir * this.lean.x * 0.03;
  }

  // Closed outline in field units: down the left side, around the base, up the right.
  outline(grow) {
    const t = this.reduced.matches ? 0 : this.t;
    const cx = 0.5 + this.lean.x * 0.015;
    const pts = [];
    const top = BOX.y0;
    for (let i = 0; i <= STEPS; i += 1) {
      const y = top + ((BASE_Y - top) * i) / STEPS;
      pts.push([cx - this.side(y, -1, t, grow), y]);
    }
    const hwL = this.side(BASE_Y, -1, t, grow);
    const hwR = this.side(BASE_Y, 1, t, grow);
    const depth = BASE_DEPTH * grow + this.lean.y * 0.02;
    for (let i = 1; i < STEPS; i += 1) {
      const a = Math.PI - (Math.PI * i) / STEPS; // left (pi) to right (0) through the bottom
      const hw = Math.cos(a) < 0 ? hwL : hwR;
      pts.push([cx + Math.cos(a) * hw, BASE_Y + Math.sin(a) * depth]);
    }
    for (let i = STEPS; i >= 0; i -= 1) {
      const y = top + ((BASE_Y - top) * i) / STEPS;
      pts.push([cx + this.side(y, 1, t, grow), y]);
    }
    return pts;
  }

  toBox([x, y]) {
    return [(x - BOX.x0) / (BOX.x1 - BOX.x0), (y - BOX.y0) / (BOX.y1 - BOX.y0)];
  }

  draw() {
    const { width: w, height: h } = this.tiny;
    const ctx = this.ctx;
    const c = this.colors;
    ctx.clearRect(0, 0, w, h);
    // Flat red to the base. On phones, one mask on the hero fades the red and
    // the cutout together, so two separate fades never disagree.
    ctx.fillStyle = c.red;
    ctx.beginPath();
    this.outline(1).forEach((p, i) => {
      const [bx, by] = this.toBox(p);
      if (i) ctx.lineTo(bx * w, by * h);
      else ctx.moveTo(bx * w, by * h);
    });
    ctx.closePath();
    ctx.fill();
    present(this.canvas, this.tiny);

    if (this.contour) {
      const d = this.outline(1.07).map((p, i) => {
        const [bx, by] = this.toBox(p);
        return `${i ? "L" : "M"}${(bx * 1000).toFixed(1)} ${(by * 1000).toFixed(1)}`;
      }).join("");
      this.contour.setAttribute("d", d);
    }
  }
}

// Corner field (wide screens): red that rises from the top-right corner of the
// window and fills the upper-right region. The boundary is a rounded quarter of
// a superellipse, centered on the corner. Its radii come from the portrait's
// position on every frame, so Lily's silhouette down to the chest stays inside
// the red (red-on-red at the cutout edge). The boundary falls through brown to
// black, breathes slowly, and carries a fine gold contour.
const CORNER_N = 3; // superellipse exponent: 2 is an ellipse, higher is squarer
const CORNER_STEPS = 96;
const LOW_RES = 6; // the canvas is 1/LOW_RES of the window; CSS scales it up

export class CornerField {
  constructor({ canvas, contour, colors }) {
    this.canvas = canvas;
    this.contour = contour;
    this.colors = colors;
    this.rect = null;
    this.radii = null;
    this.lean = { x: 0, y: 0 };
    this.leanTarget = { x: 0, y: 0 };
    this.t = 0;
    this.last = 0;
    this.raf = 0;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced.addEventListener("change", () => this.start());
    document.addEventListener("visibilitychange", () => this.start());
    window.addEventListener("resize", () => this.resize(), { passive: true });
    this.resize();
    this.start();
  }

  setColors(colors) { this.colors = { ...this.colors, ...colors }; this.draw(); }

  setGaze(angle) {
    this.leanTarget = angle == null ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) };
    if (this.reduced.matches) this.draw();
  }

  // The portrait field's rect in viewport pixels (from the scroll stage).
  setPortrait(rect) {
    this.rect = rect;
    if (this.reduced.matches || !this.raf) this.draw();
  }

  resize() {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    this.canvas.width = Math.ceil(W / LOW_RES);
    this.canvas.height = Math.ceil(H / LOW_RES);
    this.tiny = makeTiny(this.canvas);
    this.ctx = this.tiny.getContext("2d");
    this.contour?.ownerSVGElement?.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.draw();
  }

  start() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.draw();
    if (!this.reduced.matches && !document.hidden) this.raf = requestAnimationFrame((n) => this.loop(n));
  }

  loop(now) {
    this.raf = requestAnimationFrame((n) => this.loop(n));
    if (now - this.last < 1000 / FPS) return;
    if (!this.canvas.getClientRects().length) return; // hidden by the layout
    const dt = this.last ? Math.min(100, now - this.last) : 33;
    this.last = now;
    this.t += dt / 1000;
    const k = 1 - Math.pow(0.9, dt / 33);
    this.lean.x += (this.leanTarget.x - this.lean.x) * k;
    this.lean.y += (this.leanTarget.y - this.lean.y) * k;
    this.draw();
  }

  // Radii that keep the lower-left hair point of the portrait inside the red.
  target(W, H) {
    const r = this.rect;
    if (!r) return { rx: W * 0.62, ry: H * 1.05 };
    const px = r.left + r.width * 0.05;
    const py = r.top + r.height * 0.86;
    const ry = Math.max(H * 1.02, py * 1.25);
    const dx = Math.max(1, W - px);
    const room = Math.max(0.05, 0.9 - Math.pow(py / ry, CORNER_N));
    return { rx: dx / Math.pow(room, 1 / CORNER_N), ry };
  }

  outline(W, H, grow) {
    const t = this.reduced.matches ? 0 : this.t;
    const { rx, ry } = this.radii;
    const pts = [[W + 40, -40]];
    for (let i = 0; i <= CORNER_STEPS; i += 1) {
      const th = (i / CORNER_STEPS) * (Math.PI / 2); // 0: on the top edge, pi/2: on the right edge
      const wob = 1
        + 0.03 * Math.sin(th * 5 + t * 0.4)
        + 0.018 * Math.sin(th * 9 - t * 0.27 + 1.1)
        + 0.012 * Math.sin(t * 0.55);
      const f = grow * wob;
      const c = Math.pow(Math.cos(th), 2 / CORNER_N);
      const s = Math.pow(Math.sin(th), 2 / CORNER_N);
      pts.push([W - rx * f * c + this.lean.x * 14, ry * f * s + this.lean.y * 10]);
    }
    return pts;
  }

  draw() {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const goal = this.target(W, H);
    // Ease the radii, so a jump in the portrait position does not snap the field.
    if (!this.radii || this.reduced.matches) this.radii = goal;
    else {
      this.radii.rx += (goal.rx - this.radii.rx) * 0.25;
      this.radii.ry += (goal.ry - this.radii.ry) * 0.25;
    }
    const ctx = this.ctx;
    const sx = this.tiny.width / W;
    const sy = this.tiny.height / H;
    ctx.clearRect(0, 0, this.tiny.width, this.tiny.height);
    const fill = (grow, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      this.outline(W, H, grow).forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy)));
      ctx.closePath();
      ctx.fill();
    };
    // Brown bands outside the red; the CSS blur blends them into one falloff.
    fill(1.12, this.colors.brown3);
    fill(1.07, this.colors.brown2);
    fill(1.03, this.colors.brown1);
    fill(1, this.colors.red);
    present(this.canvas, this.tiny);
    if (this.contour) {
      const d = this.outline(W, H, 1.06).slice(1).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
      this.contour.setAttribute("d", d);
    }
  }
}
