"""Extract the 64-frame look-around ring and the center frame from public/character.mp4.

The source clip is not one clean circle from frame 0. It contains these segments:

    0-5      close-up at a larger scale (not used: the scale jumps)
    6-17     transition out of the frontal pose
    18-180   one full look-around, counter-clockwise on screen
    184-238  upward hold, a blink near 212, then a frontal pose with eye contact

KEYFRAMES records the screen direction of the head for frames in the look-around.
The angles are hand annotations from contact sheets (approximately +/-15 degrees).
The angle uses the browser convention: Math.atan2(dy, dx) with y down, so
0 = right, 90 = down, 180 = left, -90 = up. Values are unwrapped, so they
decrease monotonically through the turn.

The script samples 64 ring frames evenly in head angle over that turn. It
does not sample evenly in time, because the turn speed is not constant. Ring
index i then has the angle RING_START_DEG - i * 360 / 64, so the runtime maps
an angle to an index with one division.

The frames are cutouts with alpha (scripts/matte/matte.py, macOS Vision).
The page draws its own surface behind them, so the video background and its
rectangle edges never show. --no-matte writes opaque frames instead.

Usage:
    python3 scripts/extract_video_frames.py
    python3 scripts/extract_video_frames.py --width 1080 --quality 90
    python3 scripts/extract_video_frames.py --no-matte
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "matte"))
import matte  # noqa: E402

# (source frame, unwrapped screen angle in degrees)
KEYFRAMES: list[tuple[int, float]] = [
    (18, -90.0),
    (30, -135.0),
    (45, -180.0),
    (60, -225.0),
    (75, -255.0),
    (90, -270.0),
    (105, -300.0),
    (120, -325.0),
    (135, -360.0),
    (150, -390.0),
    (165, -420.0),
    (180, -450.0),
]
RING_START_DEG = -90.0
# Recorded transition between the ring's "up" pose and eye contact: in the
# order 17 down to 6, the head drops from up (next to ring frame 18) to the
# camera. The runtime plays them to return to eye contact,
# and forward to leave it. Their scale matches the ring and frame 232.
RETURN_SOURCE_FRAMES = list(range(17, 5, -1))
CENTER_SOURCE_FRAME = 232
FACE_CENTER_NORMALIZED = (0.5, 0.36)
DEADZONE_FRACTION_OF_RADIUS = 0.12


def source_frame_for_angle(angle: float) -> int:
    """Return the source frame whose annotated angle is nearest to `angle` (unwrapped)."""
    frames = np.array([k[0] for k in KEYFRAMES], dtype=float)
    angles = np.array([k[1] for k in KEYFRAMES], dtype=float)
    # np.interp needs increasing x, and the angles decrease.
    return int(round(float(np.interp(angle, angles[::-1], frames[::-1]))))


def read_frame(capture: cv2.VideoCapture, index: int) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    if not ok:
        raise SystemExit(f"Could not read source frame {index}")
    return frame


def write_webp(path: Path, frame: np.ndarray, size: tuple[int, int], quality: int) -> int:
    if (frame.shape[1], frame.shape[0]) != size:
        frame = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
    encoded, buffer = cv2.imencode(".webp", frame, [cv2.IMWRITE_WEBP_QUALITY, quality])
    if not encoded:
        raise SystemExit(f"Could not encode {path.name}")
    path.write_bytes(buffer.tobytes())
    return len(buffer)


def sample_background(frame: np.ndarray) -> list[int]:
    """Median RGB of the two top corners, where the frame shows only the red field."""
    h, w = frame.shape[:2]
    s = max(8, w // 12)
    patch = np.concatenate([frame[8 : 8 + s, 8 : 8 + s].reshape(-1, 3), frame[8 : 8 + s, w - 8 - s : w - 8].reshape(-1, 3)])
    b, g, r = np.median(patch, axis=0)
    return [int(r), int(g), int(b)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract Lily's 64-frame look-around ring from the character video.")
    parser.add_argument("--input", type=Path, default=Path("public/character.mp4"))
    parser.add_argument("--output", type=Path, default=Path("public/frames"))
    parser.add_argument("--center-output", type=Path, default=Path("public/center.webp"))
    parser.add_argument("--count", type=int, default=64)
    parser.add_argument("--width", type=int, default=864, help="output width; height keeps the source aspect ratio")
    parser.add_argument("--quality", type=int, default=86)
    parser.add_argument("--center-frame", type=int, default=CENTER_SOURCE_FRAME)
    parser.add_argument("--no-matte", action="store_true", help="write opaque frames; no cutout")
    args = parser.parse_args()

    capture = cv2.VideoCapture(str(args.input))
    if not capture.isOpened():
        raise SystemExit(f"Unable to open video: {args.input}")
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    if width * 16 != height * 9:
        print(f"note: source is {width}x{height}, not exact 9:16")
    if KEYFRAMES[-1][0] >= total or args.center_frame >= total:
        raise SystemExit(f"Video has {total} frames; keyframe annotations expect at least {max(KEYFRAMES[-1][0], args.center_frame) + 1}.")

    out_w = min(args.width, width)
    out_h = int(round(out_w * height / width))
    args.output.mkdir(parents=True, exist_ok=True)
    for old in list(args.output.glob("frame_*.webp")) + list(args.output.glob("return_*.webp")) + [args.output / "center.webp"]:
        old.unlink(missing_ok=True)

    step = 360.0 / args.count
    frames: list[dict] = []
    images: dict[str, np.ndarray] = {}
    for i in range(args.count):
        angle = RING_START_DEG - i * step
        source = source_frame_for_angle(angle)
        filename = f"frame_{i:03d}.webp"
        images[f"ring{i:03d}"] = read_frame(capture, source)
        screen = ((angle + 180.0) % 360.0) - 180.0
        frames.append({"index": i, "source_frame": source, "angle_degrees": round(screen, 3), "filename": filename})
    returns: list[dict] = []
    for i, source in enumerate(RETURN_SOURCE_FRAMES):
        filename = f"return_{i:02d}.webp"
        images[f"return{i:02d}"] = read_frame(capture, source)
        returns.append({"index": i, "source_frame": source, "filename": filename})
    images["center"] = read_frame(capture, args.center_frame)
    background = sample_background(images["center"])
    capture.release()

    use_matte = not args.no_matte and matte.available()
    if not args.no_matte and not use_matte:
        print("note: swiftc or the Vision tool is not available; writing opaque frames")
    if use_matte:
        masks = matte.masks_for(images)
        images = {k: matte.cutout(v, masks[k]) for k, v in images.items()}

    total_bytes = 0
    for i, f in enumerate(frames):
        total_bytes += write_webp(args.output / f["filename"], images[f"ring{i:03d}"], (out_w, out_h), args.quality)
    for r in returns:
        total_bytes += write_webp(args.output / r["filename"], images[f"return{r['index']:02d}"], (out_w, out_h), args.quality)
    total_bytes += write_webp(args.center_output, images["center"], (out_w, out_h), min(100, args.quality + 6))

    metadata = {
        "schema_version": "2.0",
        "source_video": str(args.input),
        "source_dimensions": [width, height],
        "source_fps": fps,
        "source_frame_count": total,
        "source_segment": [KEYFRAMES[0][0], KEYFRAMES[-1][0]],
        "dimensions": [out_w, out_h],
        "frame_count": args.count,
        "frame_order": "evenly spaced in screen angle; index increases counter-clockwise on screen",
        "angle_convention": "Math.atan2(dy, dx), y down: 0 right, 90 down, 180 left, -90 up",
        "angle_offset_degrees": RING_START_DEG,
        "angle_step_degrees": -step,
        "angle_annotations": [{"source_frame": f, "angle_degrees": a} for f, a in KEYFRAMES],
        "angle_annotation_note": "hand annotated from contact sheets; approximately +/-15 degrees",
        "face_center_normalized": list(FACE_CENTER_NORMALIZED),
        "center_deadzone_fraction_of_radius": DEADZONE_FRACTION_OF_RADIUS,
        "center_filename": "../center.webp",
        "center_source_frame": args.center_frame,
        "background_rgb": background,
        "alpha": use_matte,
        "matte": {"tool": "macOS Vision VNGenerateForegroundInstanceMaskRequest", "side_ramp": matte.SIDE_RAMP, "bottom_ramp": matte.BOTTOM_RAMP} if use_matte else None,
        "frames": frames,
        "return_sequence": {
            "note": "from the ring's up pose (index 0) to eye contact; play in reverse to leave eye contact",
            "joins_ring_index": 0,
            "frames": returns,
        },
    }
    (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "source": [width, height, fps, total],
        "output": [out_w, out_h],
        "frames": args.count,
        "unique_source_frames": len({f["source_frame"] for f in frames}),
        "return_frames": len(returns),
        "center_source_frame": args.center_frame,
        "background_rgb": background,
        "alpha": use_matte,
        "total_kib": round(total_bytes / 1024),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
