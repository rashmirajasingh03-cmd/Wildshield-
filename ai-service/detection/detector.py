"""
YOLO-based object detector for WildShield AI.

Wraps Ultralytics YOLO to run inference on individual frames.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: dict  # {x1, y1, x2, y2}
    frame_index: int
    timestamp: float  # seconds
    threatLevel: str = "NONE"
    threatCategory: str = "observed_object"


@dataclass
class Detector:
    model_path: str = "models/yolo11n.pt"
    confidence_threshold: float = 0.40
    iou_threshold: float = 0.45
    device: str = "cpu"
    _model: object = field(default=None, repr=False)

    def load(self) -> None:
        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
            logger.info("YOLO model loaded from %s", self.model_path)
        except Exception as e:
            logger.error("Failed to load YOLO model: %s", e)
            self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def get_classes(self) -> list:
        if not self.is_loaded:
            return []
        try:
            return list(self._model.names.values())
        except Exception:
            return []

    def handles_labels(self) -> dict:
        """Reports whether the current model can detect key wildlife/threat labels."""
        classes = {c.lower() for c in self.get_classes()}
        report = {
            "human": "person" in classes,
            "wildlife_animals": [c for c in self.get_classes() if c in [
                "bird", "cat", "dog", "horse", "sheep", "cow",
                "elephant", "bear", "zebra", "giraffe",
            ]],
            "primate_monkey_baboon": bool(
                classes & {"monkey", "baboon", "ape", "gorilla", "chimpanzee"}
            ),
            "weapons": [c for c in self.get_classes() if c.lower() in {
                "knife", "gun", "rifle", "pistol", "shotgun", "sword", "axe",
                "machete", "hatchet",
            }],
            "projectiles_arrows_bows": [c for c in self.get_classes() if c.lower() in {
                "arrow", "bow", "crossbow", "spear", "javelin", "bow_and_arrow",
            }],
            "traps_snares": [c for c in self.get_classes() if c.lower() in {
                "trap", "snare", "net", "cage", "snares", "leg_hold_trap",
            }],
            "environmental_fire": [c for c in self.get_classes() if c.lower() in {
                "fire", "flame", "smoke", "fire_flames", "burning",
            }],
        }
        return report

    def detect(
        self, frame: np.ndarray, frame_index: int = 0, timestamp: float = 0.0
    ) -> list[Detection]:
        if not self.is_loaded:
            return []

        try:
            results = self._model.predict(
                source=frame,
                conf=self.confidence_threshold,
                iou=self.iou_threshold,
                device=self.device,
                verbose=False,
            )
        except Exception as e:
            logger.error("Detection failed on frame %d: %s", frame_index, e)
            return []

        detections = []
        if results and len(results) > 0:
            result = results[0]
            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().tolist()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    label = result.names.get(cls_id, f"class_{cls_id}")

                    detections.append(
                        Detection(
                            label=label,
                            confidence=round(conf, 4),
                            bbox={
                                "x1": round(x1, 2),
                                "y1": round(y1, 2),
                                "x2": round(x2, 2),
                                "y2": round(y2, 2),
                            },
                            frame_index=frame_index,
                            timestamp=round(timestamp, 2),
                        )
                    )

        return detections

    def detect_batch(
        self, frames: list[tuple[np.ndarray, int, float]]
    ) -> list[Detection]:
        all_detections = []
        for frame, idx, ts in frames:
            all_detections.extend(self.detect(frame, idx, ts))
        return all_detections
