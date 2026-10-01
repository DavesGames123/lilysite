from __future__ import annotations

import csv
import json
from pathlib import Path

from .config import PipelineConfig
from .prompts import filename
from .references import reference_metadata


def coordinate_entries(config: PipelineConfig) -> list[dict]:
    refs = reference_metadata(config)
    entries = []
    for phi, theta in config.expected_coordinates:
        entries.append(
            {
                "filename": filename(phi, theta),
                "phi_yaw_degrees": phi,
                "theta_pitch_degrees": theta,
                "resolution": None,
                "status": "missing",
                "prompt_file": f"prompts/{Path(filename(phi, theta)).stem}.txt",
                "identity_reference_files": refs["identity_reference_files"],
                "style_reference_file": refs["style_reference_file"],
                "provider": config.provider,
                "model": config.model,
                "generation_metadata": {},
                "validation": {},
            }
        )
    return entries


def write_manifests(entries: list[dict], destination: Path, metadata: dict | None = None) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    metadata = metadata or {}
    payload = {
        "schema_version": "1.0",
        "sampling_version": "lily-45-grid-v1",
        "expected_view_count": len(entries),
        "metadata": metadata,
        "views": entries,
    }
    (destination / "manifest.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    fields = [
        "filename", "phi_yaw_degrees", "theta_pitch_degrees", "resolution", "status",
        "prompt_file", "identity_reference_files", "style_reference_file", "provider", "model",
        "generation_metadata", "validation",
    ]
    with (destination / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for entry in entries:
            row = dict(entry)
            row["resolution"] = json.dumps(row["resolution"]) if row["resolution"] else ""
            row["identity_reference_files"] = json.dumps(row["identity_reference_files"])
            row["generation_metadata"] = json.dumps(row["generation_metadata"])
            row["validation"] = json.dumps(row["validation"])
            writer.writerow(row)

