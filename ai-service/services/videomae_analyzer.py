"""
WildShield threat-analysis layer - fuses YOLO object evidence with VideoMAE
temporal action evidence to produce an honest, structured verdict.

DESIGN PRINCIPLES
-----------------
1. DETECTION != THREAT. A weapon, person, or animal present in the video is
   NEVER an alert by itself.
2. An event is only classified as a *potential* attack / *possible* poaching /
   *suspicious* activity when there is sufficient evidence combining BOTH:
     - temporal action signal from VideoMAE over a SEQUENCE of frames, and
     - corroborating object evidence from YOLO (person + animal, weapon, etc.).
3. Wording is always probable and non-accusatory:
     potential threat / potential attack / suspicious activity /
     possible poaching activity.
4. If VideoMAE is running in pretrained/model-development mode (no fine-tuned
   checkpoint), it contributes NO fabricated action class; the analyzer only
   uses the YOLO rules (as before) and reports the VideoMAE status honestly.
5. The final decision is never made from a single frame - YOLO evidence is
   aggregated across all sampled frames and VideoMAE acts on the whole clip.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from detection.classifier import is_human, is_weapon, is_wildlife
from detection.detector import Detection

logger = logging.getLogger(__name__)

# Maps a VideoMAE action (from a fine-tuned Wildshield head) to a Friendly
# label + a threat level, used only when the action is supported.
ACTION_META = {
    "animal_human_interaction": ("Potential animal-human interaction", "LOW"),
    "animal_attack": ("Potential animal attack", "HIGH"),
    "human_attack": ("Potential human attack", "HIGH"),
    "poaching": ("Possible poaching activity", "HIGH"),
    "animal_capture": ("Possible animal capture/poaching", "HIGH"),
    "weapon_use": ("Potential weapon use", "HIGH"),
    "suspicious_activity": ("Suspicious activity", "MEDIUM"),
}


@dataclass
class ThreatAnalyzerV2:
    """
    Combines YOLO detections + VideoMAE action into a single structured result.

    The class is additive: you can run it purely on YOLO detections (as before)
    or wind in VideoMAE evidence. It never throws when VideoMAE is unavailable.
    """

    def analyze(
        self,
        detections: list[Detection],
        videomae_result: Optional[dict] = None,
    ) -> dict:
        """
        detections      : aggregated YOLO detections across the sampled frames.
        videomae_result : output of VideoMAEClassifier.classify_clip() or None.

        Returns a structured dict compatible with the existing threat_result
        while adding the VideoMAE metadata fields.
        """
        # --- 1. Aggregate YOLO object evidence across ALL frames ---
        person_detected = any(is_human(d.label) for d in detections)
        weapon_detected = any(is_weapon(d.label) for d in detections)
        animals_detected = sorted(
            {d.label for d in detections if is_wildlife(d.label)}
        )
        detected_objects = sorted({d.label for d in detections})

        # --- 2. Extract the VideoMAE temporal signal ---
        vmae = videomae_result or {}
        action_class = vmae.get("predicted_action")
        action_confidence = round(float(vmae.get("confidence", 0.0)), 4)
        mode = vmae.get("mode", "not_loaded")

        # VideoMAE only counts as evidence when it is a fine-tuned model that
        # actually predicts one of our Wildshield classes with enough confidence.
        action_supported = bool(
            action_class
            and action_class != "normal"
            and mode == "finetuned_wildshield"
            and action_confidence
            >= self.action_threshold
        )

        # --- 3. Decide the verdict ---
        # We require at least one of the three independent evidence pillars.
        # A weapon or person alone is never enough; a single-frame object must
        # be paired with corroborating evidence.
        if action_supported:
            verdict, level = self._verdict_from_action(action_class)
            if weapon_detected:
                verdict = "potential_weapon_based_attack"
            reason = ACTION_META.get(action_class, ("Potential threat", "MEDIUM"))[0]
        elif weapon_detected:
            # A weapon detected in a wildlife context is a threat — no
            # interaction evidence required. The mere presence of a weapon
            # (gun, knife, arrow, trap, etc.) near wildlife constitutes a
            # potential threat regardless of whether contact is observed.
            if person_detected or animals_detected:
                verdict = "potential_weapon_threat"
                level = "CRITICAL"
                reason = "A weapon was detected in proximity to a person or animal."
            else:
                verdict = "weapon_present"
                level = "HIGH"
                reason = "A weapon was detected in the video. Presence of a weapon constitutes a threat."
        elif animals_detected and person_detected:
            verdict = "potential_animal_human_interaction"
            level = "MEDIUM"
            reason = "An animal and a person were detected in the same video."
        else:
            verdict = "normal"
            level = "NONE"
            reason = (
                "No corroborating attack/poaching evidence was found. "
                "Objects detected do not by themselves constitute a threat."
            )

        # --- 4. Build honest metadata ---
        videomae_info = {
            "loaded": vmae.get("model_loaded", bool(vmae.get("mode")) and mode != "not_loaded"),
            "mode": mode,
            "action_class": action_class,
            "action_confidence": action_confidence,
            "num_frames": vmae.get("num_frames", 0),
            "sampled_frames": vmae.get("sampled_frames", 0),
            "analyzed_frames": vmae.get("analyzed_frames", 0),
            "processing_time_ms": vmae.get("processing_time_ms", 0),
            "limitation": self._limitation_text(mode),
        }

        payload = {
            "classification": verdict,
            "threat_level": level,
            "confidence": self._blend_confidence(action_supported, action_confidence, weapon_detected),
            "weapon_detected": weapon_detected,
            "person_detected": person_detected,
            "animals_detected": animals_detected,
            "detected_objects": detected_objects,
            "reason": reason,
            "action_class": action_class,
            "action_confidence": action_confidence,
            "action_supported": action_supported,
            "model": {
                "object_detector": "YOLO",
                "action_classifier": "VideoMAE",
                "videomae_mode": mode,
            },
            "videomae": videomae_info,
            # Original YOLO verdict preserved for backward compatibility.
            "verdict_legacy": "ANIMAL_HARM_DETECTED"
            if verdict not in ("normal",)
            else "NO_THREAT",
            # Whether the weapon presence alone triggered the threat (without
            # requiring engagement evidence).
            "weapon_alone_trigger": weapon_detected and not (person_detected or animals_detected),
        }
        return payload

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @property
    def action_threshold(self) -> float:
        # Imported here to avoid a circular dependency on config at module load.
        # Confidence threshold is read once per call (cheap).
        try:
            from utils.config import get_settings

            return get_settings().videomae_confidence_threshold
        except Exception:
            return 0.5

    @staticmethod
    def _verdict_from_action(action: str) -> tuple[str, str]:
        if action == "animal_attack":
            return "potential_animal_human_attack", "HIGH"
        if action == "human_attack":
            return "potential_human_attack", "HIGH"
        if action in ("poaching", "animal_capture"):
            return "possible_poaching_activity", "HIGH"
        if action == "weapon_use":
            return "potential_weapon_use", "HIGH"
        if action == "animal_human_interaction":
            return "potential_animal_human_interaction", "MEDIUM"
        if action == "suspicious_activity":
            return "suspicious_activity", "MEDIUM"
        return "potential_threat", "MEDIUM"

    @staticmethod
    def _blend_confidence(action_supported: bool, action_conf: float, weapon: bool) -> float:
        if not action_supported:
            # YOLO-only evidence; keep modest. Presence is not certainty.
            if weapon:
                return 0.65
            return 0.3
        # Action evidence present - weigh it but never report > confidence.
        base = action_conf * 0.6
        if weapon:
            base += 0.1
        return round(min(0.99, base), 4)

    @staticmethod
    def _limitation_text(mode: str) -> str:
        if mode == "finetuned_wildshield":
            return (
                "Loaded a Wildshield-specific fine-tuned checkpoint. "
                "Accuracy is only as good as the training data; evaluate on a "
                "representative test set before relying on these classes."
            )
        if mode == "pretrained_model_development":
            return (
                "Running in PRETRAINED / MODEL-DEVELOPMENT mode. The stock "
                "VideoMAE model is a generic video feature extractor and has "
                "NOT been trained on Wildshield wildlife-crime classes, so no "
                "custom action class is claimed. Fine-tune a checkpoint to "
                "enable wildlife-crime action recognition."
            )
        return "VideoMAE action classifier is not loaded."
