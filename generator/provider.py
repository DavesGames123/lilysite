from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class ProviderError(RuntimeError):
    """An expected provider failure that should be surfaced to the operator."""


@dataclass
class GenerationResult:
    path: str
    provider: str
    model: str
    metadata: dict[str, Any]


class ImageProvider:
    name = "base"
    model = ""

    def generate(self, *, prompt: str, output_path: str, references: list[str]) -> GenerationResult:
        raise NotImplementedError


class UnavailableProvider(ImageProvider):
    name = "unavailable"

    def generate(self, *, prompt: str, output_path: str, references: list[str]) -> GenerationResult:
        raise ProviderError(
            "No callable image-generation provider is configured. The built-in image service "
            "was unavailable during this run; configure an approved provider adapter before "
            "running --anchors or --all."
        )


def get_provider(name: str = "unavailable") -> ImageProvider:
    if name in {"", "unavailable", "builtin"}:
        return UnavailableProvider()
    raise ProviderError(f"Unknown provider '{name}'. Add an adapter in generator/provider.py.")

