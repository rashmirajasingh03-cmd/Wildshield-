"""
VideoMAE temporal action recognition classifier for WildShield AI.

This module provides a single VideoMAEClassifier responsible for:

  - Loading a pretrained VideoMAE video transformer + its image processor.
  - Optionally loading a Wildshield-specific FINE-TUNED checkpoint on top of
    the pretrained backbone (when VIDEOMAE_CHECKPOINT is set).
  - Sampling a fixed number of frames from a video (temporal sampling).
  - Preprocessing the sampled clip for VideoMAE.
  - Running inference over the clip (a SEQUENCE of frames, not a single frame).
  - Returning class probabilities and the predicted action.

HONESTY NOTE (important ML requirement)
---------------------------------------
The stock MCG-NJU/videomae-base checkpoint is pretrained on generic video
datasets (e.g. Kinetics) and produces a GENERIC video representation. It
CANNOT reliably recognize Wildshield-specific classes such as `poaching`,
`animal_capture`, `weapon_use`, etc, because those classes were never part of
its training vocabulary.

Distinction implemented here:
  - PRETRAINED / MODEL-DEVELOPMENT mode  (no checkpoint):
      VIDEOMAE_CHECKPOINT is empty. The classifier reports that it is running
      in pretrained/generic mode and does NOT fabricate predictions for the
      custom classes. It does not claim high accuracy for wildlife crimes.
  - FINE-TUNED / Wildshield-specific mode  (checkpoint set):
      VIDEOMAE_CHECKPOINT points to a model trained on the Wildshield dataset.
      Only then are the custom class labels used for real classification.

The pretrained model still provides a genuine "generic video action"
signal (from its own head), which is combined with YOLO object evidence by
the threat analyzer - it is never treated as proof of a wildlife crime.
"""

import logging
from pathlib import Path
from typing import Optional, Union

import numpy as np

logger = logging.getLogger(__name__)

# Wildshield conceptual action classes (supported once a fine-tuned
# checkpoint with this same label order is provided).
WILDSHIELD_CLASSES = [
    "normal",
    "animal_human_interaction",
    "animal_attack",
    "human_attack",
    "poaching",
    "animal_capture",
    "weapon_use",
    "suspicious_activity",
]

WILDSHIELD_CLASS_INDEX = {name: i for i, name in enumerate(WILDSHIELD_CLASSES)}


class VideoMAEClassifier:
    """VideoMAE-based temporal (video-level) action classifier."""

    def __init__(
        self,
        model_name: str = "MCG-NJU/videomae-base",
        checkpoint: Optional[str] = None,
        num_frames: int = 16,
        confidence_threshold: float = 0.5,
        device: str = "cpu",
    ):
        self.model_name = model_name
        self.checkpoint = checkpoint or None
        self.num_frames = int(num_frames)
        self.confidence_threshold = float(confidence_threshold)
        self.device = device
        self._processor = None
        self._model = None
        self._labels = None
        self._is_finetuned = bool(self.checkpoint)
        self.sampled_frames = 0
        self.analyzed_frames = 0

    # ------------------------------------------------------------------
    # Loading (kept separate from FastAPI route code; done once at startup)
    # ------------------------------------------------------------------
    def load(self) -> None:
        """Load the image processor and the VideoMAE model (CPU or GPU)."""
        import torch
        from transformers import VideoMAEImageProcessor, VideoMAEModel, VideoMAEForVideoClassification

        logger.info(
            "Loading VideoMAE classifier (model=%s, checkpoint=%s) on device=%s",
            self.model_name,
            self.checkpoint or "<pretrained-only>",
            self.device,
        )

        # Image processor handles frame normalization/resizing for VideoMAE.
        self._processor = VideoMAEImageProcessor.from_pretrained(self.model_name)

        loaded_finetuned = False
        if self.checkpoint:
            # Fine-tuned Wildshield checkpoint: load a full classification head
            # trained for our custom classes.
            try:
                self._model = VideoMAEForVideoClassification.from_pretrained(
                    self.checkpoint
                )
                labels = getattr(self._model.config, "id2label", None)
                if labels:
                    self._labels = [labels[i] for i in sorted(labels)]
                else:
                    self._labels = list(WILDSHIELD_CLASSES)
                loaded_finetuned = True
                self._is_finetuned = True
                logger.info("Loaded fine-tuned Wildshield VideoMAE checkpoint.")
            except Exception as e:
                # Do NOT crash the API. Fall back to honest pretrained mode.
                logger.error(
                    "Failed to load fine-tuned checkpoint %s: %s. "
                    "Falling back to PRETRAINED / MODEL-DEVELOPMENT mode "
                    "(no custom wildlife-crime classes claimed).",
                    self.checkpoint,
                    e,
                )
                self._model = None
                self._is_finetuned = False

        if not loaded_finetuned:
            # Pretrained / model-development mode: a classification head was
            # never trained for Wildshield classes, so load the generic
            # representation model. Its output is a generic video embedding and
            # is NOT mapped to Wildshield wildlife-crime classes.
            self._model = VideoMAEModel.from_pretrained(
                self.model_name,
                ignore_mismatched_sizes=True,
            )
            self._labels = None
            self._is_finetuned = False

        self._model.to(self.device)
        self._model.eval()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def is_finetuned(self) -> bool:
        """True when a Wildshield-specific checkpoint is actually in use."""
        return bool(self._is_finetuned and self._model is not None)

    @property
    def mode_label(self) -> str:
        if not self.is_loaded:
            return "not_loaded"
        if self.is_finetuned:
            return "finetuned_wildshield"
        return "pretrained_model_development"

    # ------------------------------------------------------------------
    # Frame sampling (temporal sampling - do NOT send every frame)
    # ------------------------------------------------------------------
    def sample_frames(self, video_path: str) -> list[np.ndarray]:
        """
        Extract a fixed number of frames evenly spaced across the video.

        Handles short videos (fewer frames than requested), long videos
        (subsample), low FPS, different resolutions, and corrupted/unreadable
        frames without raising. Returns a list of BGR ndarrays.
        """
        import cv2

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            logger.warning("VideoMAE cannot open video: %s", video_path)
            return []

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total_frames <= 0:
            # Frames count unknown (some streams). Scan for a valid frame.
            first_valid = None
            idx = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame is not None and frame.size > 0:
                    first_valid = frame
                    break
                idx += 1
            cap.release()
            return [first_valid] if first_valid is not None else []

        # Evenly spaced indices across the whole clip.
        n = self.num_frames
        if total_frames < n:
            # Short video: take all frames (or repeat the few we have).
            indices = list(range(total_frames))
        else:
            step = max(1, total_frames // n)
            indices = [min(i * step, total_frames - 1) for i in range(n)]

        frames = []
        for want_idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, want_idx)
            ret, frame = cap.read()
            if ret and frame is not None and frame.size > 0:
                frames.append(frame)
            # Skip corrupted/unreadable frames silently instead of crashing.

        cap.release()
        self.sampled_frames = len(indices)
        self.analyzed_frames = len(frames)
        return frames

    # ------------------------------------------------------------------
    # Preprocessing + inference
    # ------------------------------------------------------------------
    def _preprocess(self, frames: list[np.ndarray]):
        """Convert BGR frames to a VideoMAE pixel_values tensor on the device."""
        if not frames:
            return None

        # Reuse the processor on the raw BGR frames (it expects RGB uint8).
        # The processor internally resizes to the model's expected resolution.
        try:
            inputs = self._processor(
                frames,
                return_tensors="pt",
            )
        except Exception as e:
            logger.warning("VideoMAE preprocessing failed: %s", e)
            return None

        return inputs

    def classify_clip(self, frames: list[np.ndarray]) -> dict:
        """
        Run VideoMAE over a sampled clip (sequence of frames).

        Returns:
          {
            "class_probabilities": {...label->prob} or {},
            "predicted_action": str or None,
            "confidence": float,
            "mode": "pretrained_model_development" | "finetuned_wildshield",
            "used_frames": int,
          }

        In pretrained/model-development mode, if the generic backbone has no
        trained classification head, the result expresses honest uncertainty
        (empty probabilities, None action) rather than fabricating a class.
        """
        import torch

        if not self.is_loaded:
            return self._empty_result()
        if not frames:
            self.analyzed_frames = 0
            return self._empty_result()

        inputs = self._preprocess(frames)
        if inputs is None:
            return self._empty_result()

        try:
            with torch.no_grad():
                outputs = self._model(**inputs)
        except Exception as e:
            logger.warning("VideoMAE inference failed: %s", e)
            return self._empty_result()

        logits = getattr(outputs, "logits", None)

        # Fine-tuned classification head present.
        if logits is not None:
            probs = torch.softmax(logits, dim=-1)[0]
            probs_np = probs.cpu().numpy()
            labels = self._labels or WILDSHIELD_CLASSES
            prob_dict = {
                labels[i]: round(float(probs_np[i]), 4)
                for i in range(min(len(labels), len(probs_np)))
            }
            best_idx = int(torch.argmax(probs).item())
            best_label = (
                labels[best_idx] if best_idx < len(labels) else None
            )
            confidence = round(float(probs[best_idx].item()), 4)

            return {
                "class_probabilities": prob_dict,
                "predicted_action": best_label,
                "confidence": confidence,
                "mode": self.mode_label,
                "used_frames": len(frames),
            }

        # No classification head (pretrained generic backbone): we genuinely
        # cannot map it to Wildshield classes, so report honest uncertainty.
        logger.info(
            "Pretrained VideoMAE backbone produced no logits; generic mode. "
            "Not fabricating predictions for Wildshield classes."
        )
        return {
            "class_probabilities": {},
            "predicted_action": None,
            "confidence": 0.0,
            "mode": self.mode_label,
            "used_frames": len(frames),
        }

    def _empty_result(self) -> dict:
        return {
            "class_probabilities": {},
            "predicted_action": None,
            "confidence": 0.0,
            "mode": self.mode_label if self.is_loaded else "not_loaded",
            "used_frames": 0,
        }

    def unload(self) -> None:
        """Release GPU memory. (Currently kept for future use.)"""
        self._model = None
        self._processor = None
