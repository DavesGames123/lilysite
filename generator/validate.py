from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageStat

from .config import CONFIG, PipelineConfig
from .manifest import coordinate_entries, write_manifests
from .prompts import filename
from .references import reference_manifest


TARGET_RED = (236, 14, 18)


def validate_image(path: Path, config: PipelineConfig) -> dict:
    result = {"exists": path.exists(), "decoded": False, "dimensions": None, "min_dimension_pass": False, "mode": None, "background_red_score": None, "issues": []}
    if not path.exists():
        result["issues"].append("missing_file")
        return result
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            result["decoded"] = True
            result["dimensions"] = [image.width, image.height]
            result["min_dimension_pass"] = min(image.size) >= config.min_dimension
            result["mode"] = image.mode
            if not result["min_dimension_pass"]:
                result["issues"].append("resolution_below_minimum")
            if image.width != image.height:
                result["issues"].append("not_square")
            rgb = image.convert("RGB")
            sample = rgb.resize((32, 32))
            avg = ImageStat.Stat(sample).mean
            distance = sum((avg[i] - TARGET_RED[i]) ** 2 for i in range(3)) ** 0.5
            result["background_red_score"] = round(max(0.0, 1.0 - distance / 255.0), 4)
            if result["background_red_score"] < 0.55:
                result["issues"].append("background_not_close_to_target_red")
    except Exception as exc:
        result["issues"].append(f"decode_error:{exc}")
    return result


def validate(config: PipelineConfig) -> dict:
    entries = coordinate_entries(config)
    report = {
        "schema_version": "1.0",
        "expected_total": len(entries),
        "generated_total": 0,
        "automated_pass_total": 0,
        "human_review_total": 0,
        "missing_coordinates": [],
        "resolution_failures": [],
        "background_failures": [],
        "face_detection_failures": [],
        "suspected_pose_mismatches": [],
        "identity_consistency_caveat": "Automated checks do not prove that all views preserve Lily's identity; human review remains required.",
        "views": [],
    }
    for entry in entries:
        path = config.image_dir / entry["filename"]
        validation = validate_image(path, config)
        entry["validation"] = validation
        if validation["exists"] and validation["decoded"]:
            report["generated_total"] += 1
        if not validation["exists"]:
            report["missing_coordinates"].append([entry["phi_yaw_degrees"], entry["theta_pitch_degrees"]])
        if "resolution_below_minimum" in validation["issues"]:
            report["resolution_failures"].append(entry["filename"])
        if "background_not_close_to_target_red" in validation["issues"]:
            report["background_failures"].append(entry["filename"])
        if validation["exists"] and validation["decoded"] and not validation["issues"]:
            entry["status"] = "needs_human_review"
            report["automated_pass_total"] += 1
            report["human_review_total"] += 1
        else:
            entry["status"] = "failed_automated_checks" if validation["exists"] else "missing"
        report["views"].append({"filename": entry["filename"], "phi": entry["phi_yaw_degrees"], "theta": entry["theta_pitch_degrees"], "status": entry["status"], "validation": validation})
    config.report_dir.mkdir(parents=True, exist_ok=True)
    (config.report_dir / "validation_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    write_manifests(entries, config.output_dir, reference_manifest(config))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Lily phi/theta view files.")
    parser.parse_args()
    report = validate(CONFIG)
    print(json.dumps({k: report[k] for k in ("expected_total", "generated_total", "automated_pass_total", "human_review_total", "missing_coordinates")}, indent=2))
    return 0 if report["generated_total"] == report["expected_total"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

