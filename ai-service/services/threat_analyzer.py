"""
WildShield threat analyzer.

Turns raw YOLO detections into a threat assessment using explicit rules:

1. An animal detected alone        -> OBSERVATION (never a threat by itself)
2. A person detected alone         -> OBSERVATION (never a threat by itself)
3. A weapon/trap/arrow/fire        -> THREAT
4. Person + animal + weapon in the
   same context/frame              -> "human attacking wildlife" THREAT (CRITICAL)
5. Person + weapon (no animal)     -> "armed human" THREAT (HIGH)
6. Person + animal, NO weapon      -> OBSERVATION "human present near wildlife"
                                      (NOT a threat - attack can't be confirmed)

The rules operate on classification produced by detection/classifier.py, which
defines the label taxonomy (wildlife / human / weapon / environmental). Any
YOLO model producing labels in that taxonomy enables this reasoning.
"""

import logging
from collections import Counter
from dataclasses import asdict, dataclass

from detection.classifier import ThreatClassifier, is_wildlife, is_human, is_weapon
from detection.detector import Detection

logger = logging.getLogger(__name__)

LEVEL_PRIORITY = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "NONE": 4}


@dataclass
class ThreatAnalyzer:
    context_window: int = 3  # sampled-frame window used to merge per-frame context

    def analyze(self, detections: list[Detection]) -> dict:
        classifier = ThreatClassifier()
        annotated = classifier.classify_all(list(detections))

        # Group annotated detections per sampled frame
        frames: dict[int, list[Detection]] = {}
        for d in annotated:
            frames.setdefault(d.frame_index, []).append(d)

        threat_events = []
        sorted_frame_ids = sorted(frames.keys())

        for idx, fidx in enumerate(sorted_frame_ids):
            frame_dets = frames[fidx]

            animals = [d for d in frame_dets if is_wildlife(d.label)]
            persons = [d for d in frame_dets if is_human(d.label)]
            weapons = [
                d for d in frame_dets
                if is_weapon(d.label)
            ]
            environments = [
                d for d in frame_dets
                if d.threatCategory == "environmental_threat"
            ]

            # Expand context to nearby sampled frames so a person mis-tracked
            # across a couple of frames still gets matched to the animal/weapon.
            neighbor_labels = {
                d.label
                for j in range(max(0, idx - self.context_window), min(len(sorted_frame_ids), idx + self.context_window + 1))
                for d in frames[sorted_frame_ids[j]]
            }
            neighbor_animal = any(is_wildlife(l) for l in neighbor_labels)
            neighbor_person = any(is_human(l) for l in neighbor_labels)
            neighbor_weapon = any(is_weapon(l) for l in neighbor_labels)

            # Rule 4: person + animal + weapon co-occurring -> human attacking wildlife
            if persons and (animals or neighbor_animal) and (weapons or neighbor_weapon):
                for p in persons:
                    p.threatLevel = "CRITICAL"
                    p.threatCategory = "human_attacking_wildlife"
                threat_events.append({
                    "type": "human_attacking_wildlife",
                    "frame": fidx,
                    "level": "CRITICAL",
                    "description": (
                        "Human with a weapon near wildlife - possible attack or "
                        "hunting in progress (anti-poaching alert)."
                    ),
                    "actors": {
                        "person": [d.label for d in persons],
                        "animal": sorted({d.label for d in animals}) or
                                  sorted({l for l in neighbor_labels if is_wildlife(l)}),
                        "weapon": sorted({d.label for d in weapons}) or
                                  sorted({l for l in neighbor_labels if is_weapon(l)}),
                    },
                })
                continue

            # Rule 5: armed human (no animal nearby)
            if persons and (weapons or neighbor_weapon):
                for p in persons:
                    p.threatLevel = "HIGH"
                    p.threatCategory = "human_armed"
                threat_events.append({
                    "type": "human_armed",
                    "frame": fidx,
                    "level": "HIGH",
                    "description": "Armed human detected on site.",
                    "actors": {
                        "person": [d.label for d in persons],
                        "weapon": sorted({d.label for d in weapons}) or
                                  sorted({l for l in neighbor_labels if is_weapon(l)}),
                        "animal": [],
                    },
                })
                continue

            # Rule 6: person near animal, NO weapon -> observation, NOT a threat
            if persons and (animals or neighbor_animal):
                for p in persons:
                    p.threatCategory = "human_present_near_wildlife"
                continue

            # Rule 3: standalone weapons / fire already carry their own threat
            # level on the detection itself.
            if weapons or environments:
                for w in weapons:
                    threat_events.append({
                        "type": "weapon_found",
                        "frame": fidx,
                        "level": w.threatLevel,
                        "label": w.label,
                        "description": f"{w.label} detected - poaching/attack implement.",
                    })
                for e in environments:
                    threat_events.append({
                        "type": "environmental_threat",
                        "frame": fidx,
                        "level": e.threatLevel,
                        "label": e.label,
                        "description": f"{e.label} detected - fire/hazard.",
                    })

        # Deduplicate standalone weapon/fire events (same label near frames)
        unique_events = []
        seen = set()
        for ev in threat_events:
            key = (ev["type"], ev.get("label", ""), ev["frame"] // max(1, self.context_window))
            if key in seen:
                continue
            seen.add(key)
            unique_events.append(ev)
        threat_events = unique_events

        # ---- Aggregate statistics -------------------------------
        label_counts = Counter(d.label for d in annotated)
        threat_counts = Counter(d.threatLevel for d in annotated)
        category_counts = Counter(d.threatCategory for d in annotated)

        levels_present = [lvl for lvl in threat_counts if lvl != "NONE"]
        if levels_present:
            highest_threat = min(levels_present, key=lambda l: LEVEL_PRIORITY[l])
        elif threat_events:
            highest_threat = min(
                (ev["level"] for ev in threat_events),
                key=lambda l: LEVEL_PRIORITY[l],
            )
        else:
            highest_threat = "NONE"

        threats_found = sum(
            c for lvl, c in threat_counts.items() if lvl in ("CRITICAL", "HIGH", "MEDIUM", "LOW")
        ) if not threat_events else max(
            sum(c for lvl, c in threat_counts.items() if lvl in ("CRITICAL", "HIGH", "MEDIUM", "LOW")),
            len(threat_events),
        )

        return {
            "detections": [asdict(d) for d in annotated],
            "total_detections": len(annotated),
            "threats_found": threats_found,
            "highest_threat": highest_threat,
            "label_counts": dict(label_counts),
            "threat_counts": dict(threat_counts),
            "category_counts": dict(category_counts),
            "threat_events": threat_events,
        }