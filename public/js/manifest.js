// Frame manifest and frame store.
//
// loadManifest() reads /frames/metadata.json (written by
// scripts/extract_video_frames.py) and returns a ring description, or null
// when the frame set is absent. FrameStore loads the frame images in
// priority order: main.js loads the center frame first, prioritize() loads
// frames near the requested index, and queueAll() loads the rest. main.js
// calls queueAll() from requestIdleCallback or on the first pointer input.
// A frame that fails is never requested again, and it goes to onFail.

const FRAMES_BASE = "/frames/";

export async function loadManifest() {
  let response;
  try {
    response = await fetch(`${FRAMES_BASE}metadata.json`, { cache: "no-cache" });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const meta = await response.json().catch(() => null);
  if (!meta || !Array.isArray(meta.frames) || meta.frames.length === 0) return null;
  const count = meta.frames.length;
  const [width, height] = meta.dimensions || meta.source_dimensions;
  return {
    meta,
    count,
    width,
    height,
    offsetRad: ((meta.angle_offset_degrees ?? 0) * Math.PI) / 180,
    // The ring index increases as the screen angle decreases (counter-clockwise).
    stepRad: ((meta.angle_step_degrees ?? -360 / count) * Math.PI) / 180,
    faceCenter: meta.face_center_normalized || [0.5, 0.4],
    deadzone: meta.center_deadzone_fraction_of_radius ?? 0.12,
    centerUrl: new URL(meta.center_filename || "../center.webp", new URL(FRAMES_BASE, location.href)).pathname,
    frameUrls: meta.frames.map((f) => `${FRAMES_BASE}${f.filename}`),
    // Recorded move from the ring's up pose (index 0) to eye contact; may be absent.
    returnUrls: (meta.return_sequence?.frames || []).map((f) => `${FRAMES_BASE}${f.filename}`),
    background: meta.background_rgb || null,
  };
}

export function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => (image.decode ? image.decode().catch(() => {}).then(() => resolve(image)) : resolve(image));
    image.onerror = () => reject(new Error(`failed to load ${url}`));
    image.src = url;
  });
}

export class FrameStore {
  constructor(ring, { concurrency = 4 } = {}) {
    this.ring = ring;
    this.images = new Array(ring.count).fill(null);
    this.pending = new Set();
    this.failed = new Set();
    this.queue = [];
    this.concurrency = concurrency;
    this.active = 0;
    this.onLoad = null;
    this.onFail = null;
  }

  has(index) {
    return this.images[index] !== null;
  }

  get loadedCount() {
    return this.images.filter(Boolean).length;
  }

  // Put the frames within `radius` of `index` at the head of the queue.
  prioritize(index, radius = 3) {
    const near = [];
    for (let d = 0; d <= radius; d += 1) {
      near.push((index + d) % this.ring.count, (index - d + this.ring.count) % this.ring.count);
    }
    this.queue = [...new Set(near), ...this.queue.filter((i) => !near.includes(i))];
    this.pump();
  }

  // Queue every frame, ordered by distance from `index`, and load it lazily.
  queueAll(index = 0) {
    const order = [];
    for (let d = 0; d <= this.ring.count / 2; d += 1) {
      order.push((index + d) % this.ring.count, (index - d + this.ring.count) % this.ring.count);
    }
    const rest = [...new Set(order)].filter((i) => !this.queue.includes(i));
    this.queue.push(...rest);
    this.pump();
  }

  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const index = this.queue.shift();
      if (this.has(index) || this.pending.has(index) || this.failed.has(index)) continue;
      this.pending.add(index);
      this.active += 1;
      decodeImage(this.ring.frameUrls[index])
        .then((image) => {
          this.images[index] = image;
          this.onLoad?.(index);
        })
        .catch(() => {
          this.failed.add(index);
          this.onFail?.(index);
        })
        .finally(() => {
          this.pending.delete(index);
          this.active -= 1;
          this.pump();
        });
    }
  }

  // Return the loaded frame nearest to `index` on the ring, or null.
  nearestLoaded(index) {
    for (let d = 0; d <= this.ring.count / 2; d += 1) {
      const a = (index + d) % this.ring.count;
      if (this.images[a]) return { index: a, image: this.images[a] };
      const b = (index - d + this.ring.count) % this.ring.count;
      if (this.images[b]) return { index: b, image: this.images[b] };
    }
    return null;
  }
}
