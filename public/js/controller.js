// Pointer, touch, and keyboard input for the portrait.
//
// The controller turns input into one of two targets and reports it through
// onTarget():
//   { center: true }                  direct eye contact
//   { center: false, angle: radians } look toward the screen angle
// The angle is Math.atan2(dy, dx) from Lily's face center, with y down.

const KEY_VECTORS = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export class PointerController {
  // getFace(): optional; returns { x, y, radius } on screen for the face the
  // gaze aims from (for example the companion portrait). Default: the field.
  constructor(field, { faceCenter, deadzone, onTarget, getFace }) {
    this.getFace = getFace;
    this.field = field;
    this.faceCenter = faceCenter;
    this.deadzone = deadzone;
    this.onTarget = onTarget;
    this.keys = new Set();
    this.touching = false;
    this.cursor = null;
    this.enabled = false;
    this.abort = null;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.abort = new AbortController();
    const opts = { signal: this.abort.signal };
    const passive = { signal: this.abort.signal, passive: true };

    // Mouse and pen: follow the cursor anywhere in the window.
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      this.cursor = [event.clientX, event.clientY];
      this.aim(event.clientX, event.clientY);
    }, passive);
    // relatedTarget is null when the cursor leaves the window.
    document.addEventListener("mouseout", (event) => {
      if (event.relatedTarget) return;
      this.cursor = null;
      this.onTarget({ center: true });
    }, passive);
    window.addEventListener("blur", () => this.onTarget({ center: true }), passive);

    // Touch: Lily follows the finger anywhere on the page. The listeners are
    // passive, so scrolling is never blocked, and touchmove continues during a
    // scroll. After the finger lifts, the gaze holds for a moment, then
    // returns to eye contact.
    const follow = (event) => {
      const t = event.touches[0];
      if (!t) return;
      clearTimeout(this.releaseTimer);
      this.touching = true;
      this.cursor = null;
      this.aim(t.clientX, t.clientY);
    };
    window.addEventListener("touchstart", follow, passive);
    window.addEventListener("touchmove", follow, passive);
    window.addEventListener("touchend", (event) => {
      if (event.touches.length) return;
      this.touching = false;
      clearTimeout(this.releaseTimer);
      this.releaseTimer = setTimeout(() => this.onTarget({ center: true }), 900);
    }, passive);
    window.addEventListener("touchcancel", () => {
      this.touching = false;
      this.onTarget({ center: true });
    }, passive);

    // Keyboard: the arrow keys point the gaze, and combinations give diagonals.
    this.field.addEventListener("keydown", (event) => this.keydown(event), opts);
    // Keyup only clears the key. Two keys never release in the same instant,
    // so a recompute on keyup would drop a diagonal to one axis.
    this.field.addEventListener("keyup", (event) => { this.keys.delete(event.key); }, opts);
    this.field.addEventListener("blur", () => {
      if (this.keys.size) { this.keys.clear(); this.onTarget({ center: true }); }
    }, passive);
  }

  disable() {
    this.enabled = false;
    this.abort?.abort();
    this.abort = null;
    clearTimeout(this.releaseTimer);
    this.keys.clear();
    this.touching = false;
  }

  // The portrait moved under a still cursor (scroll or layout): aim again.
  // Keyboard and touch targets are not changed.
  refresh() {
    if (this.enabled && this.cursor && !this.touching && this.keys.size === 0) this.aim(...this.cursor);
  }

  aim(clientX, clientY) {
    let face = this.getFace?.();
    if (!face) {
      const rect = this.field.getBoundingClientRect();
      // Portrait radius: half the longer side of the displayed 9:16 field.
      face = { x: rect.left + rect.width * this.faceCenter[0], y: rect.top + rect.height * this.faceCenter[1], radius: Math.max(rect.width, rect.height) / 2 };
    }
    const dx = clientX - face.x;
    const dy = clientY - face.y;
    const radius = face.radius;
    if (Math.hypot(dx, dy) < radius * this.deadzone) {
      this.onTarget({ center: true });
    } else {
      this.onTarget({ center: false, angle: Math.atan2(dy, dx) });
    }
  }

  keydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape" || event.key === "Home" || event.key === "0") {
      event.preventDefault();
      this.keys.clear();
      this.onTarget({ center: true });
      return;
    }
    if (!KEY_VECTORS[event.key]) return;
    event.preventDefault();
    this.cursor = null;
    this.keys.add(event.key);
    this.fromKeys();
  }

  fromKeys() {
    let x = 0;
    let y = 0;
    for (const key of this.keys) { x += KEY_VECTORS[key][0]; y += KEY_VECTORS[key][1]; }
    if (x === 0 && y === 0) return;
    // The gaze holds after key release. Escape returns to eye contact.
    this.onTarget({ center: false, angle: Math.atan2(y, x) });
  }
}
