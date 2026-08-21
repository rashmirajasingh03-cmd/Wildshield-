"""
Configuration loader for the WildShield AI service.

All environment access is centralized here. Values mirror the settings
required by section 6 of the spec (MODEL_PATH, CONFIDENCE_THRESHOLD,
IOU_THRESHOLD, FRAME_INTERVAL) so later phases can consume them directly.
"""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

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
    device: str = os.getenv("DEVICE", "cpu")

    # Video limits (enforced from Phase 4/5)
    max_video_size_mb: int = field(
        default_factory=lambda: _get_int("MAX_VIDEO_SIZE_MB", 200)
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
    return _settings
