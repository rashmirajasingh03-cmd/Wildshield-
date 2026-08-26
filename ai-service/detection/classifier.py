"""
Threat classifier for WildShield AI.

Maps YOLO detections to threat levels and categories using configurable rules.
"""

import logging
from dataclasses import dataclass

from .detector import Detection

logger = logging.getLogger(__name__)

# Threat classification rules
# Maps YOLO class labels to (threat_level, threat_category)
THREAT_RULES: dict[str, tuple[str, str]] = {
    # Weapons & tools
    "gun": ("CRITICAL", "weapon"),
    "rifle": ("CRITICAL", "weapon"),
    "knife": ("HIGH", "weapon"),
    "sword": ("HIGH", "weapon"),
    "axe": ("MEDIUM", "tool"),
    # People in restricted context
    "person": ("MEDIUM", "unauthorized_entry"),
    # Animals (potential poaching targets)
    "elephant": ("HIGH", "endangered_wildlife"),
    "rhinoceros": ("CRITICAL", "endangered_wildlife"),
    "tiger": ("CRITICAL", "endangered_wildlife"),
    "lion": ("HIGH", "endangered_wildlife"),
    "bear": ("MEDIUM", "wildlife_risk"),
    "deer": ("LOW", "wildlife"),
    # Vehicles & equipment
    "car": ("MEDIUM", "vehicle_intrusion"),
    "truck": ("HIGH", "vehicle_intrusion"),
    "motorcycle": ("MEDIUM", "vehicle_intrusion"),
    "boat": ("MEDIUM", "vehicle_intrusion"),
    # Traps & snares
    "trap": ("CRITICAL", "poaching_equipment"),
    # Fire
    "fire": ("HIGH", "environmental_threat"),
    "smoke": ("MEDIUM", "environmental_threat"),
}

DEFAULT_THREAT_LEVEL = "LOW"
DEFAULT_CATEGORY = "detected_object"


@dataclass
class ThreatClassifier:
    custom_rules: dict | None = None

    @property
    def rules(self) -> dict:
        return self.custom_rules or THREAT_RULES

    def classify(self, detection: Detection) -> Detection:
        label_lower = detection.label.lower()

        if label_lower in self.rules:
            level, category = self.rules[label_lower]
        else:
            level = DEFAULT_THREAT_LEVEL
            category = DEFAULT_CATEGORY

        detection.threatLevel = level
        detection.threatCategory = category
        return detection

    def classify_all(self, detections: list[Detection]) -> list[Detection]:
        return [self.classify(d) for d in detections]

    def get_summary(self, detections: list[Detection]) -> dict:
        classified = self.classify_all(detections)
        threats = [d for d in classified if d.threatLevel not in ("NONE", "LOW")]

        threat_counts = {}
        for d in classified:
            level = d.threatLevel
            threat_counts[level] = threat_counts.get(level, 0) + 1

        return {
            "total_detections": len(classified),
            "threats_found": len(threats),
            "threat_counts": threat_counts,
            "categories": list(
                set(d.threatCategory for d in classified if d.threatCategory)
            ),
        }
