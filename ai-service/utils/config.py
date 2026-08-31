"""
Configuration loader for the WildShield AI service.

All environment access is centralized here. Values mirror the settings
required by section 6 of the spec (MODEL_PATH, CONFIDENCE_THRESHOLD,
IOU_THRESHOLD, FRAME_INTERVAL) so later phases can consume them directly.
"""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv


def resolve_device(configured: str) -> str:
    """
    Resolve the inference device from the DEVICE config value.

    Values:
      - "auto" (default): GPU if available, otherwise CPU.
      - "cuda": GPU if available, otherwise raises at model load time.
      - "cpu": always CPU.
    """
    if configured and configured.lower() == "cuda":
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        # CUDA requested but unavailable -> fall back to CPU for reliability.
        return "cpu"
    if configured and configured.lower() != "auto":
        # Explicit device such as "mps" or a torch device string.
        return configured
    # "auto" (or empty): use GPU when present, else CPU.
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"

load_dotenv()


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class Settings:
    environment: str = os.getenv("AI_ENV", "development")
    host: str = os.getenv("AI_HOST", "0.0.0.0")
    port: int = field(default_factory=lambda: _get_int("AI_PORT", 8000))

    # Model configuration (consumed from Phase 5 onwards)
    model_path: str = os.getenv("MODEL_PATH", "models/yolo11n.pt")
    confidence_threshold: float = field(
        default_factory=lambda: _get_float("CONFIDENCE_THRESHOLD", 0.40)
    )
    iou_threshold: float = field(
        default_factory=lambda: _get_float("IOU_THRESHOLD", 0.45)
    )
    frame_interval: int = field(
        default_factory=lambda: _get_int("FRAME_INTERVAL", 10)
    )
    # DEVICE selects inference hardware. "auto" is recommended (GPU if
    # available, else CPU). The resolved value is stored at startup.
    device: str = field(default_factory=lambda: os.getenv("DEVICE", "auto"))
    # Populated in get_settings() via resolve_device() - the actual hardware
    # string ("cuda"/"cpu"/...) passed to the models.
    resolved_device: str = "cpu"

    # VideoMAE temporal action recognition configuration
    videomae_model_name: str = os.getenv(
        "VIDEOMAE_MODEL_NAME", "MCG-NJU/videomae-base"
    )
    # Path to a Wildshield-specific fine-tuned checkpoint. When empty, the
    # service runs in PRETRAINED / MODEL-DEVELOPMENT mode and does NOT claim
    # the custom wildlife-crime classes.
    videomae_checkpoint: str = os.getenv("VIDEOMAE_CHECKPOINT", "")
    # Number of clip frames sampled from the video and fed to VideoMAE.
    videomae_num_frames: int = field(
        default_factory=lambda: _get_int("VIDEOMAE_NUM_FRAMES", 16)
    )
    # Minimum confidence for VideoMAE to contribute an action to the result.
    videomae_confidence_threshold: float = field(
        default_factory=lambda: _get_float("VIDEOMAE_CONFIDENCE_THRESHOLD", 0.5)
    )
    # If true, the VideoMAE model is loaded at application startup (background)
    # rather than lazily on the first analysis. Default false to keep startup/health fast.
    videomae_eager_load: bool = (
        os.getenv("VIDEOMAE_EAGER_LOAD", "false").lower() == "true"
    )

    # Video limits (enforced from Phase 4/5)
    max_video_size_mb: int = field(
        default_factory=lambda: _get_int("MAX_VIDEO_SIZE_MB", 200)
    )

    # Re-encoding the full video with boxes is expensive and unused by the UI.
    # Off by default; enable via RENDER_ANNOTATED_VIDEO=true when needed.
    render_annotated_video: bool = (
        os.getenv("RENDER_ANNOTATED_VIDEO", "false").lower() == "true"
    )

    # Demo mode: any simulated output must be labeled "DEMO DATA"
    demo_mode: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    allowed_origins: list = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv(
                "ALLOWED_ORIGINS", "http://localhost:5000,http://127.0.0.1:5000"
            ).split(",")
            if o.strip()
        ]
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        # Resolve "auto"/"cuda"/"cpu" into a concrete hardware string once, so
        # both YOLO and VideoMAE use the same resolved device at load time.
        _settings.resolved_device = resolve_device(_settings.device)
    return _settings
