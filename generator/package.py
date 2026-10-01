from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

from .config import CONFIG
from .validate import validate


def package() -> Path:
    report = validate(CONFIG)
    if report["generated_total"] != report["expected_total"] or report["automated_pass_total"] != report["expected_total"]:
        raise RuntimeError("Quality gate failed: all 45 individual images must exist and pass automated checks before packaging.")
    package_root = CONFIG.root / "output" / "lily_phi_theta_dataset"
    images_dir = package_root / "images"
    prompts_dir = package_root / "prompts"
    package_root.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(exist_ok=True)
    prompts_dir.mkdir(exist_ok=True)
    for source in sorted(CONFIG.image_dir.glob("lily_phi_*.png")):
        (images_dir / source.name).write_bytes(source.read_bytes())
    for source in sorted(CONFIG.prompt_dir.glob("*.txt")):
        (prompts_dir / source.name).write_bytes(source.read_bytes())
    for name in ("manifest.csv", "manifest.json"):
        (package_root / name).write_bytes((CONFIG.output_dir / name).read_bytes())
    (package_root / "validation_report.json").write_bytes((CONFIG.report_dir / "validation_report.json").read_bytes())
    (package_root / "README.txt").write_text("Lily phi/theta dataset package. See the repository README for pipeline instructions.\n", encoding="utf-8")
    archive = CONFIG.root / "output" / "lily_phi_theta_dataset.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as handle:
        for path in sorted(package_root.rglob("*")):
            if path.is_file():
                handle.write(path, Path("lily_phi_theta_dataset") / path.relative_to(package_root))
    return archive


def main() -> int:
    argparse.ArgumentParser(description="Package Lily's validated 45-view dataset.").parse_args()
    archive = package()
    print(archive)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

