"""Build 2D gaze layers from the approved stylized portrait."""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "references" / "lily_stylized_approved.png"
DEST = ROOT / "public" / "assets" / "lily"
EYES = {"left": (574, 369), "right": (775, 395)}
RADIUS = 18


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    rgb = np.array(source)
    mask = np.zeros((rgb.shape[0], rgb.shape[1]), dtype=np.uint8)
    for x, y in EYES.values():
        cv2.circle(mask, (x, y), RADIUS + 2, 255, -1)
    base = cv2.inpaint(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, 3, cv2.INPAINT_TELEA)
    Image.fromarray(cv2.cvtColor(base, cv2.COLOR_BGR2RGB)).save(DEST / "lily_rig_base.png")

    size = (RADIUS * 2 + 10, RADIUS * 2 + 10)
    alpha = Image.new("L", size, 0)
    ImageDraw.Draw(alpha).ellipse((3, 3, size[0] - 3, size[1] - 3), fill=255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(2.2))
    for name, (x, y) in EYES.items():
        box = (x - size[0] // 2, y - size[1] // 2, x + size[0] // 2, y + size[1] // 2)
        sprite = source.crop(box).convert("RGBA")
        sprite.putalpha(alpha)
        sprite.save(DEST / f"lily_rig_iris_{name}.png")


if __name__ == "__main__":
    main()
