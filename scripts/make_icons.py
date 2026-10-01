"""Make the site icons: a red serif "L" on near-black.

The L is Georgia Bold Italic (macOS), in the studio red, on the page's night
color, in a rounded square. Didot was tried first; its hairlines vanish at
16 px, and Georgia's heavy strokes hold. Writes:

    public/favicon.ico                  16, 32, 48 px
    public/icons/favicon-32.png
    public/icons/apple-touch-icon.png   180 px, square (iOS rounds it)
    public/icons/icon-192.png, icon-512.png   for site.webmanifest

Usage:
    python3 scripts/make_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
RED = (212, 30, 18)
NIGHT = (11, 10, 13)
FONT = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"
FONT_INDEX = 0
SIZE = 1024


def mark(rounded: bool) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(SIZE * 0.22) if rounded else 0
    d.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=radius, fill=NIGHT + (255,))
    font = ImageFont.truetype(FONT, int(SIZE * 0.86), index=FONT_INDEX)
    left, top, right, bottom = d.textbbox((0, 0), "L", font=font)
    x = (SIZE - (right - left)) / 2 - left - SIZE * 0.01
    y = (SIZE - (bottom - top)) / 2 - top
    d.text((x, y), "L", font=font, fill=RED + (255,))
    return img


def main() -> int:
    (PUBLIC / "icons").mkdir(exist_ok=True)
    tab = mark(rounded=True)
    full = mark(rounded=False).convert("RGB")
    fit = lambda img, n: img.resize((n, n), Image.LANCZOS)
    fit(full, 180).save(PUBLIC / "icons" / "apple-touch-icon.png", optimize=True)
    fit(full, 192).save(PUBLIC / "icons" / "icon-192.png", optimize=True)
    fit(full, 512).save(PUBLIC / "icons" / "icon-512.png", optimize=True)
    fit(tab, 32).save(PUBLIC / "icons" / "favicon-32.png", optimize=True)
    fit(tab, 256).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    for p in sorted((PUBLIC / "icons").glob("*.png")) + [PUBLIC / "favicon.ico"]:
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size} B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
