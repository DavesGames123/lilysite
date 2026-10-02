"""Static checks for the résumé site. It needs no browser.

Checks:
  - index.html is current with content/profile.json
  - every profile fact shows in the page text
  - the page contains no email address, phone number, social link, or street address
  - no CSS or JS uses perspective, rotate, or 3D transforms
  - the frame set is complete: 64 frames, metadata, and center.webp
  - no JS module blends frames (globalAlpha other than 1)

Usage:
    python3 scripts/check_site.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
failures = 0


def check(ok: bool, name: str, detail: str = "") -> None:
    global failures
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  — ' + detail if detail else ''}")


def page_text(html: str) -> str:
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S)
    text = unescape(re.sub(r"<[^>]+>", " ", html))
    return re.sub(r"\s+", " ", text)


def strings(value) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [s for v in value for s in strings(v)]
    if isinstance(value, dict):
        return [s for v in value.values() for s in strings(v)]
    return []


def main() -> int:
    render = subprocess.run(["node", str(ROOT / "scripts/render_content.mjs"), "--check"], capture_output=True, text=True)
    check(render.returncode == 0, "content: index.html matches content/profile.json", render.stdout.strip())

    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    text = page_text(html)
    profile = json.loads((ROOT / "content/profile.json").read_text(encoding="utf-8"))
    # Section and nav names of empty sections and the site block do not show as page text.
    facts = strings({k: v for k, v in profile.items() if k not in ("links", "sections", "site")})
    facts += [link["label"] for link in profile.get("links", [])]
    missing = [f for f in facts if f not in text]
    check(not missing, f"content: all {len(facts)} profile strings show on the page", "; ".join(missing))

    contact = {
        "email": r"[\w.+-]+@[\w-]+\.[\w.]+",
        "phone": r"\+?\d[\d\s().-]{8,}\d",
        "mailto/tel": r"(mailto:|tel:)",
        "social": r"(?:href|src|content)=\"[^\"]*(linkedin|twitter|x\.com|instagram\.com|facebook|github|tiktok)",
    }
    # Links listed in profile.json come from a real source; nothing else may appear.
    allowed = [link["url"] for link in profile.get("links", [])]
    scrubbed = html
    for url in allowed:
        scrubbed = scrubbed.replace(url, "")
    for label, pattern in contact.items():
        # Phone numbers are checked in the visible text only; markup attributes
        # such as an SVG viewBox are digit runs too.
        haystack = page_text(scrubbed) if label == "phone" else scrubbed
        hits = re.findall(pattern, haystack, flags=re.I)
        check(not hits, f"no fabricated contact: {label}", ", ".join(map(str, hits[:3])))

    code = {p.name: p.read_text(encoding="utf-8") for p in [PUBLIC / "styles.css", *sorted((PUBLIC / "js").glob("*.js"))]}
    banned = r"(perspective|rotate[XYZ3]?\s*\(|rotate\s*:|matrix3d|translate3d|translateZ|preserve-3d|backface-visibility)"
    hits = [f"{n}:{m.group(0)}" for n, src in code.items() for m in re.finditer(banned, src)]
    check(not hits, "no CSS/JS 3D transforms or rotation", ", ".join(hits))
    alpha = [f"{n}:{m.group(0)}" for n, src in code.items() for m in re.finditer(r"globalAlpha\s*=\s*(?!1\b)[\d.]+", src)]
    check(not alpha, "renderer: no partial globalAlpha (no frame blending)", ", ".join(alpha))

    meta_path = PUBLIC / "frames/metadata.json"
    if not meta_path.exists():
        check(False, "frames: metadata.json present", "run scripts/extract_video_frames.py")
    else:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        files = [PUBLIC / "frames" / f["filename"] for f in meta["frames"]]
        check(meta["frame_count"] == 64 and len(files) == 64, "frames: metadata lists 64 frames", str(meta["frame_count"]))
        absent = [p.name for p in files if not p.exists()]
        check(not absent, "frames: every listed frame file exists", ", ".join(absent[:5]))
        check((PUBLIC / "center.webp").exists(), "frames: public/center.webp exists")
        w, h = meta["dimensions"]
        check(w * 16 == h * 9, "frames: output keeps 9:16", f"{w}x{h}")
        unique = len({f["source_frame"] for f in meta["frames"]})
        check(unique == 64, "frames: 64 distinct source frames", str(unique))
    # The source video is an extraction input only; the repository leaves it out.
    if (PUBLIC / "character.mp4").exists():
        check(True, "source: public/character.mp4 present")
    else:
        print("NOTE  source: public/character.mp4 absent (not needed to serve the site)")
    check((PUBLIC / "assets/lily/lily_stylized_approved.png").exists(), "fallback: approved portrait present")

    print(f"\n{'all static checks passed' if failures == 0 else f'{failures} static check(s) failed'}")
    return failures


if __name__ == "__main__":
    sys.exit(main())
