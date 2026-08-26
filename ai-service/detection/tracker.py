"""
Simple object tracker for WildShield AI.

Assigns stable track IDs to detections across consecutive frames
using IoU-based matching.
"""

import logging
from dataclasses import dataclass, field

from .detector import Detection

logger = logging.getLogger(__name__)


@dataclass
class Track:
    track_id: int
    label: str
    frames_seen: int = 0
    best_confidence: float = 0.0
    first_frame: int = 0
    last_frame: int = 0


@dataclass
class Tracker:
    iou_threshold: float = 0.3
    _next_id: int = field(default=0, repr=False)
    _active_tracks: dict = field(default_factory=dict, repr=False)

    def _compute_iou(self, box_a: dict, box_b: dict) -> float:
        x1 = max(box_a["x1"], box_b["x1"])
        y1 = max(box_a["y1"], box_b["y1"])
        x2 = min(box_a["x2"], box_b["x2"])
        y2 = min(box_a["y2"], box_b["y2"])

        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (box_a["x2"] - box_a["x1"]) * (box_a["y2"] - box_a["y1"])
        area_b = (box_b["x2"] - box_b["x1"]) * (box_b["y2"] - box_b["y1"])
        union = area_a + area_b - inter

        return inter / union if union > 0 else 0.0

    def update(self, detections: list[Detection]) -> list[Detection]:
        if not detections:
            self._active_tracks.clear()
            return detections

        current_frame = detections[0].frame_index if detections else 0

        new_tracks = {}
        matched_dets = set()

        for det in detections:
            best_id = None
            best_iou = 0.0

            for tid, track in self._active_tracks.items():
                if track.label != det.label:
                    continue
                if current_frame - track.last_frame > 5:
                    continue
                iou = self._compute_iou(
                    det.bbox,
                    {
                        "x1": 0,
                        "y1": 0,
                        "x2": 0,
                        "y2": 0,
                    },
                )
                if iou > best_iou and iou >= self.iou_threshold:
                    best_iou = iou
                    best_id = tid

            if best_id is not None:
                track = self._active_tracks[best_id]
                track.frames_seen += 1
                track.best_confidence = max(track.best_confidence, det.confidence)
                track.last_frame = current_frame
                new_tracks[best_id] = track
            else:
                tid = self._next_id
                self._next_id += 1
                new_tracks[tid] = Track(
                    track_id=tid,
                    label=det.label,
                    frames_seen=1,
                    best_confidence=det.confidence,
                    first_frame=current_frame,
                    last_frame=current_frame,
                )

        self._active_tracks = new_tracks
        return detections
