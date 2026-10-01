"""Make the site icons from Lily's center frame (public/center.webp).

Each icon is a square crop of her face on the studio red, so it reads at
16 px in a browser tab. Writes:

    public/favicon.ico            16, 32, 48 px
    public/icons/favicon-32.png
    public/icons/apple-touch-icon.png   180 px, opaque
    public/icons/icon-192.png, icon-512.png   for site.webmanifest

Usage:
    python3 scripts/make_icons.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
META = json.loads((PUBLIC / "frames" / "metadata.json").read_text())
RED = tuple(META.get("background_rgb", [212, 30, 18]))
FACE_X, FACE_Y = META.get("face_center_normalized", [0.5, 0.36])
# Side of the square crop, as a fraction of the frame width: hair and red around the face.
CROP_SIDE = 1.0
# Small icons crop tighter, so the face fills the 16-48 px squares.
TIGHT_SIDE = 0.84


def face_square(side_fraction: float) -> Image.Image:
    frame = Image.open(PUBLIC / "center.webp").convert("RGBA")
    w, h = frame.size
    side = int(w * side_fraction)
    cx, cy = int(w * FACE_X), int(h * FACE_Y) + int(side * 0.04)
    box = (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
    crop = frame.crop(box)
    base = Image.new("RGBA", crop.size, RED + (255,))
    base.alpha_composite(crop)
    return base.convert("RGB")


def main() -> int:
    (PUBLIC / "icons").mkdir(exist_ok=True)
    large = face_square(CROP_SIDE)
    tight = face_square(TIGHT_SIDE)
    resize = lambda img, n: img.resize((n, n), Image.LANCZOS)
    resize(large, 180).save(PUBLIC / "icons" / "apple-touch-icon.png", optimize=True)
    resize(large, 192).save(PUBLIC / "icons" / "icon-192.png", optimize=True)
    resize(large, 512).save(PUBLIC / "icons" / "icon-512.png", optimize=True)
    resize(tight, 32).save(PUBLIC / "icons" / "favicon-32.png", optimize=True)
    resize(tight, 256).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    for p in sorted((PUBLIC / "icons").glob("*.png")) + [PUBLIC / "favicon.ico"]:
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size} B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
