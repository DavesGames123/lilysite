from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class PipelineConfig:
    root: Path = ROOT
    output_dir: Path = ROOT / "output" / "lily_phi_theta_views"
    prompt_dir: Path = ROOT / "output" / "prompts"
    report_dir: Path = ROOT / "output" / "reports"
    reference_dir: Path = ROOT / "assets" / "references"
    image_dir: Path = ROOT / "assets" / "views"
    min_dimension: int = 1024
    target_dimension: int = 2048
    provider: str = "unavailable"
    model: str = ""
    retries: int = 2
    phis: tuple[int, ...] = (-60, -45, -30, -15, 0, 15, 30, 45, 60)
    thetas: tuple[int, ...] = (30, 15, 0, -15, -30)
    anchor_coordinates: tuple[tuple[int, int], ...] = (
        (0, 0),
        (-45, 0),
        (45, 0),
        (0, 15),
        (0, -15),
    )
    style_reference: str = "lily_stylized_approved.png"
    identity_references: tuple[str, ...] = field(
        default=("lily_original_graduation.jpg", "lily_original_profile.jpg")
    )

    @property
    def expected_coordinates(self) -> list[tuple[int, int]]:
        return [(phi, theta) for theta in self.thetas for phi in self.phis]


CONFIG = PipelineConfig()

