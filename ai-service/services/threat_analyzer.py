"""
Threat analyzer for WildShield AI.

Aggregates detections across frames, applies classification rules,
and produces a summary of threats found in a video.
"""

import logging
from dataclasses import dataclass, field

from detection.classifier import ThreatClassifier
from detection.detector import Detection

logger = logging.getLogger(__name__)

THREAT_PRIORITY = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]


@dataclass
class ThreatAnalyzer:
    classifier: ThreatClassifier = field(default_factory=ThreatClassifier)

    def analyze(self, detections: list[Detection]) -> dict:
        classified = self.classifier.classify_all(detections)

        threat_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "NONE": 0}
        category_counts = {}
        label_counts = {}

        for det in classified:
            level = det.threatLevel or "NONE"
            threat_counts[level] = threat_counts.get(level, 0) + 1

            cat = det.threatCategory or "unknown"
            category_counts[cat] = category_counts.get(cat, 0) + 1

            label_counts[det.label] = label_counts.get(det.label, 0) + 1

        highest_threat = "NONE"
        for level in THREAT_PRIORITY:
            if threat_counts.get(level, 0) > 0:
                highest_threat = level
                break

        threats_found = sum(
            threat_counts.get(lv, 0)
            for lv in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        )

        unique_frames = set(d.frame_index for d in classified)

        return {
            "total_detections": len(classified),
            "threats_found": threats_found,
            "highest_threat": highest_threat,
            "threat_counts": threat_counts,
            "category_counts": category_counts,
            "label_counts": label_counts,
            "frames_with_detections": len(unique_frames),
            "detections": [
                {
                    "label": d.label,
                    "confidence": d.confidence,
                    "bbox": d.bbox,
                    "frame_index": d.frame_index,
                    "timestamp": d.timestamp,
                    "threatLevel": d.threatLevel,
                    "threatCategory": d.threatCategory,
                }
                for d in classified
            ],
        }
