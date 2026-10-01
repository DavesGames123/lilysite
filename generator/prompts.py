from __future__ import annotations

from .config import PipelineConfig


def signed(value: int, width: int = 4) -> str:
    return f"{value:+0{width}d}"


def filename(phi: int, theta: int) -> str:
    return f"lily_phi_{signed(phi, 4)}_theta_{signed(theta, 4)}.png"


def pose_language(phi: int, theta: int) -> str:
    yaw = "directly toward camera" if phi == 0 else (
        f"toward the subject's left by {abs(phi)} degrees" if phi < 0
        else f"toward the subject's right by {abs(phi)} degrees"
    )
    pitch = "level" if theta == 0 else (
        f"upward by {abs(theta)} degrees" if theta > 0
        else f"downward by {abs(theta)} degrees"
    )
    return (
        f"Visible head pose: yaw phi={phi:+d} degrees, pitch theta={theta:+d} degrees. "
        f"The head is turned {yaw} and tilted {pitch}; describe the resulting visible facial geometry, "
        "not a camera move."
    )


def build_prompt(phi: int, theta: int, config: PipelineConfig) -> str:
    return f"""Use case: stylized-concept
Asset type: one independent full-resolution view for Lily's interactive portrait dataset

IDENTITY:
Use the supplied original photographs as the primary identity references and the approved stylized portrait as the visual-style reference. Preserve Lily's actual facial structure, eye shape and spacing, nose and mouth proportions, skin tone, hairline, and recognizable features. Do not substitute a generic character.

STYLE:
Premium stylized 3D character portrait, polished cinematic rendering, refined natural facial anatomy, detailed brown hair, realistic but gently stylized proportions, natural eye size slightly smaller than an exaggerated stylized reference.

CHARACTER:
Long brown hair with a natural center part, consistent length and texture, navy high-neck top, small understated gold earrings, delicate gold necklace with a simple pendant, neutral relaxed friendly expression with a closed-mouth subtle smile.

POSE:
{pose_language(phi, theta)}

FRAMING:
Head-and-shoulders portrait, full crown and complete hair silhouette visible, neck, both shoulders, upper chest, consistent camera distance, consistent character scale and centered placement with enough breathing room.

BACKGROUND:
Completely uniform vivid red background, no objects, no environment, no typography, no gradient, no confusing segmentation boundaries.

LIGHTING:
Consistent soft studio key, gentle fill, restrained warm rim light, consistent color temperature and direction across all views.

CONTINUITY:
Match the approved anchor identity, hairstyle, clothing, accessories, expression, rendering style, framing, lighting, and background. Generate this as a single full-resolution image, never a panel or contact sheet.

NEGATIVE CONSTRAINTS:
No oversized eyes, no anime features, no enlarged irises, no doll-like appearance, no face replacement, no identity drift, no hairstyle changes, no clothing changes, no extra jewelry, no background scenery, no text, no watermark, no composite grids, no contact sheets, no cropped crown, no cut-off chin, no inconsistent facial proportions.

Generation settings:
- requested native target: {config.target_dimension} x {config.target_dimension}
- phi/yaw: {phi:+d} degrees
- theta/pitch: {theta:+d} degrees
- identity references: {', '.join(config.identity_references)}
- style reference: {config.style_reference}
"""

