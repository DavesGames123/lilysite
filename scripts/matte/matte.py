"""Cut Lily out of the video frames: alpha masks, edge clean-up, and edge ramps.

The mask comes from the macOS Vision subject-lift model (lift_mask.swift).

Default ("soft") mode keeps the original edge colors and the soft mask. The
page draws a surface of the same red as the video background behind the
cutout, so an imperfect edge pixel lands red-on-red and does not show. Only
step 4 (ramps) applies.

"clean" mode is for a background that is not red. It runs four steps:

    1. choke      tighten the soft mask edge by about 1 px, so less background stays
    2. extend     give edge pixels the color of the solid subject next to them
                  (a normalized blur of interior colors). Edge pixels then carry
                  no background red. Algebraic decontamination was tried first; it
                  turned mostly-red edge pixels near black (a dark outline).
    3. despill    limit the red channel in the edge band (r <= 1.75 g + 12), so no
                  red rim light stays on the hair outline
    4. ramps      the video frame cuts the hair at the left, right, and bottom
                  edges. Alpha falls to 0 over the last SIDE_RAMP of the width and
                  BOTTOM_RAMP of the height, so the cut hair thins into the surface
                  behind it and shows no straight cut line.

macOS only. extract_video_frames.py falls back to opaque frames when the
Vision tool is not available (--no-matte).
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
SWIFT_SOURCE = HERE / "lift_mask.swift"
SIDE_RAMP = 0.07
BOTTOM_RAMP = 0.16


def available() -> bool:
    return shutil.which("swiftc") is not None and SWIFT_SOURCE.exists()


def build_tool(workdir: Path) -> Path:
    binary = workdir / "lift_mask"
    result = subprocess.run(["swiftc", "-O", "-o", str(binary), str(SWIFT_SOURCE)], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"swiftc failed:\n{result.stderr}")
    return binary


def masks_for(frames: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Return {key: float32 mask 0..1} for each BGR frame, at the frame's size."""
    with tempfile.TemporaryDirectory(prefix="lily-matte-") as tmp:
        work = Path(tmp)
        tool = build_tool(work)
        paths = []
        for key, frame in frames.items():
            p = work / f"{key}.png"
            cv2.imwrite(str(p), frame)
            paths.append(str(p))
        out = work / "masks"
        result = subprocess.run([str(tool), str(out), *paths], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"lift_mask failed:\n{result.stdout}\n{result.stderr}")
        masks = {}
        for key in frames:
            m = cv2.imread(str(out / f"{key}.mask.png"), cv2.IMREAD_GRAYSCALE)
            if m is None:
                raise RuntimeError(f"no mask for {key}")
            masks[key] = m.astype(np.float32) / 255.0
        return masks


def cutout(frame: np.ndarray, mask: np.ndarray, clean: bool = False) -> np.ndarray:
    """Return a BGRA cutout of `frame` (BGR uint8). See the module notes for the modes."""
    h, w = mask.shape
    img = frame.astype(np.float32)
    if not clean:
        return np.clip(np.dstack([img, mask * ramps(h, w) * 255.0]) + 0.5, 0, 255).astype(np.uint8)

    # 1. choke
    a = np.clip((mask - 0.1) / 0.9, 0.0, 1.0)
    a = cv2.erode(a, np.ones((3, 3), np.uint8), iterations=1)
    a = cv2.GaussianBlur(a, (0, 0), 0.9)

    # 2. extend interior colors into the edge band
    interior = (mask > 0.97).astype(np.float32)
    interior = cv2.erode(interior, np.ones((3, 3), np.uint8), iterations=2)
    num = cv2.GaussianBlur(img * interior[..., None], (0, 0), 5.0)
    den = cv2.GaussianBlur(interior, (0, 0), 5.0)[..., None]
    extended = num / np.maximum(den, 1e-4)
    edge = (a > 0.0) & (mask < 0.97)
    fg = np.where(edge[..., None] & (den > 1e-3), extended, img)
    fg = np.clip(fg, 0, 255)

    # 3. despill in a band around the outline
    k = np.ones((13, 13), np.uint8)
    outline = cv2.dilate((a > 0.5).astype(np.uint8), k) - cv2.erode((a > 0.5).astype(np.uint8), k)
    band = outline.astype(bool) | edge
    b, g, r = fg[..., 0], fg[..., 1], fg[..., 2]
    r_limited = np.minimum(r, 1.75 * g + 12.0)
    fg[..., 2] = np.where(band, r_limited, r)

    # 4. ramps at the frame edges that cut the hair
    a = a * ramps(h, w)

    out = np.dstack([fg, a * 255.0])
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def ramps(h: int, w: int) -> np.ndarray:
    """Alpha factor that falls to 0 at the left, right, and bottom frame edges."""
    x = np.linspace(0.0, 1.0, w, dtype=np.float32)
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)
    side = np.clip(np.minimum(x, 1.0 - x) / SIDE_RAMP, 0.0, 1.0)
    bottom = np.clip((1.0 - y) / BOTTOM_RAMP, 0.0, 1.0)
    smooth = lambda t: t * t * (3.0 - 2.0 * t)
    return smooth(side)[None, :] * smooth(bottom)[:, None]
