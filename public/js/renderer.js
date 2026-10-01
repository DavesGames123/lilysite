// Canvas renderer for the portrait.
//
// draw() clears the foreground canvas and draws exactly one image at full
// opacity. The renderer never blends two character frames. The frames are
// cutouts with alpha; the living surface (surface.js) is drawn behind them.
// The optional halo canvas receives a small copy of the same image.

const HALO_SCALE = 1 / 12;

export class PortraitRenderer {
  constructor(canvas, halo) {
    this.canvas = canvas;
    this.halo = halo;
    this.ctx = canvas.getContext("2d");
    this.haloCtx = halo ? halo.getContext("2d") : null;
    this.drawn = null;
    this.draws = 0;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.halo) {
        this.halo.width = Math.max(8, Math.round(width * HALO_SCALE));
        this.halo.height = Math.max(8, Math.round(height * HALO_SCALE));
      }
      this.drawn = null;
    }
  }

  // `key` names the frame, for example "center" or 17. A repeated key is a no-op.
  draw(image, key) {
    if (!image || this.drawn === key) return false;
    const { width, height } = this.canvas;
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "copy";
    this.ctx.drawImage(image, 0, 0, width, height);
    this.ctx.globalCompositeOperation = "source-over";
    if (this.haloCtx) {
      this.haloCtx.globalCompositeOperation = "copy";
      this.haloCtx.drawImage(image, 0, 0, this.halo.width, this.halo.height);
      this.haloCtx.globalCompositeOperation = "source-over";
    }
    this.drawn = key;
    this.draws += 1;
    return true;
  }

  // Fallback path: the approved square portrait inside the 9:16 field.
  // The image sits at the bottom edge, and its own top-row red fills the space above.
  drawStatic(image) {
    const { width, height } = this.canvas;
    const scale = width / image.naturalWidth;
    const drawHeight = image.naturalHeight * scale;
    const top = height - drawHeight;
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = sampleTopColor(image);
    this.ctx.fillRect(0, 0, width, Math.ceil(top) + 1);
    this.ctx.drawImage(image, 0, top, width, drawHeight);
    // Feather the join so that no hard line shows where the fill meets the image.
    const feather = this.ctx.createLinearGradient(0, top, 0, top + drawHeight * 0.08);
    feather.addColorStop(0, this.ctx.fillStyle);
    feather.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = feather;
    this.ctx.fillRect(0, top, width, drawHeight * 0.08);
    this.haloCtx?.drawImage(this.canvas, 0, 0, this.halo.width, this.halo.height);
    this.drawn = "static";
    this.draws += 1;
  }
}

function sampleTopColor(image) {
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, image.naturalWidth, 4, 0, 0, 32, 1);
  const data = ctx.getImageData(0, 0, 32, 1).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}
