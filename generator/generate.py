from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .config import CONFIG, PipelineConfig
from .manifest import coordinate_entries, write_manifests
from .prompts import build_prompt, filename
from .provider import ProviderError, get_provider
from .references import reference_manifest


def write_prompts(config: PipelineConfig) -> None:
    config.prompt_dir.mkdir(parents=True, exist_ok=True)
    for phi, theta in config.expected_coordinates:
        name = Path(filename(phi, theta)).stem + ".txt"
        (config.prompt_dir / name).write_text(build_prompt(phi, theta, config), encoding="utf-8")


def write_progress(config: PipelineConfig, entries: list[dict]) -> None:
    config.output_dir.mkdir(parents=True, exist_ok=True)
    (config.output_dir / "progress.json").write_text(
        json.dumps({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "views": entries}, indent=2) + "\n",
        encoding="utf-8",
    )


def dry_run(config: PipelineConfig, scope: str) -> int:
    write_prompts(config)
    entries = coordinate_entries(config)
    selected = set(config.anchor_coordinates) if scope == "anchors" else set(config.expected_coordinates)
    missing = [(e["phi_yaw_degrees"], e["theta_pitch_degrees"]) for e in entries if (e["phi_yaw_degrees"], e["theta_pitch_degrees"]) in selected]
    print(f"provider={config.provider or 'unconfigured'} model={config.model or 'unconfigured'}")
    print(f"target={config.target_dimension}x{config.target_dimension} minimum={config.min_dimension}px")
    print(f"scope={scope} generations={len(missing)} total_grid={len(entries)}")
    for phi, theta in missing:
        print(f"  {filename(phi, theta)}")
    write_manifests(entries, config.output_dir, reference_manifest(config))
    write_progress(config, entries)
    return 0


def run(config: PipelineConfig, scope: str, dry: bool, only_missing: bool) -> int:
    if dry:
        return dry_run(config, scope)
    write_prompts(config)
    entries = coordinate_entries(config)
    selected = set(config.anchor_coordinates) if scope == "anchors" else set(config.expected_coordinates)
    provider = get_provider(config.provider)
    for entry in entries:
        coordinate = (entry["phi_yaw_degrees"], entry["theta_pitch_degrees"])
        if coordinate not in selected:
            continue
        output_path = config.image_dir / entry["filename"]
        if only_missing and output_path.exists():
            entry["status"] = "existing_unvalidated"
            continue
        try:
            result = provider.generate(
                prompt=build_prompt(*coordinate, config),
                output_path=str(output_path),
                references=[str(config.reference_dir / ref) for ref in config.identity_references] + [str(config.reference_dir / config.style_reference)],
            )
            entry["status"] = "generated"
            entry["provider"] = result.provider
            entry["model"] = result.model
            entry["generation_metadata"] = result.metadata
        except ProviderError as exc:
            entry["status"] = "generation_unavailable"
            entry["generation_metadata"] = {"error": str(exc)}
            print(f"generation stopped at {entry['filename']}: {exc}", file=sys.stderr)
            write_manifests(entries, config.output_dir, reference_manifest(config))
            write_progress(config, entries)
            return 2
    write_manifests(entries, config.output_dir, reference_manifest(config))
    write_progress(config, entries)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Lily's independently rendered phi/theta views.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--anchors", action="store_true", help="plan or generate the five anchor views")
    group.add_argument("--all", action="store_true", help="plan or generate all 45 configured views")
    parser.add_argument("--resume", action="store_true", help="resume the selected scope from progress")
    parser.add_argument("--only-missing", action="store_true", help="skip existing image files")
    parser.add_argument("--dry-run", action="store_true", help="write prompts and print plan without provider calls")
    args = parser.parse_args()
    scope = "anchors" if args.anchors else "all"
    return run(CONFIG, scope, args.dry_run or not (args.anchors or args.all), args.only_missing or args.resume)


if __name__ == "__main__":
    raise SystemExit(main())

