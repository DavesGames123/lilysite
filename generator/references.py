from __future__ import annotations

from dataclasses import asdict

from .config import PipelineConfig


def reference_metadata(config: PipelineConfig) -> dict:
    return {
        "identity_reference_files": [
            f"assets/references/{name}" for name in config.identity_references
        ],
        "style_reference_file": f"assets/references/{config.style_reference}",
    }


def reference_manifest(config: PipelineConfig) -> dict:
    data = reference_metadata(config)
    data["config"] = {
        "target_dimension": config.target_dimension,
        "minimum_dimension": config.min_dimension,
        "phi_degrees": list(config.phis),
        "theta_degrees": list(config.thetas),
        "anchor_coordinates": [list(pair) for pair in config.anchor_coordinates],
        "provider": config.provider,
        "model": config.model,
    }
    return data

