"""
Video processor for WildShield AI.

Handles frame extraction from video files using OpenCV.
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class VideoProcessor:
    frame_interval: int = 10  # extract every Nth frame
    max_frames: int = 500

    def get_video_info(self, video_path: str) -> dict:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"error": f"Cannot open video: {video_path}"}

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        return {
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "duration_seconds": round(duration, 2),
            "width": width,
            "height": height,
        }

    def extract_frames(
        self, video_path: str
    ) -> list[tuple[np.ndarray, int, float]]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Cannot open video: %s", video_path)
            return []

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_idx = 0
        extracted = []
        frame_count = 0

        logger.info(
            "Extracting frames from %s (every %d frames, max %d)",
            video_path,
            self.frame_interval,
            self.max_frames,
        )

        while cap.isOpened() and frame_count < self.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % self.frame_interval == 0:
                timestamp = frame_idx / fps
                extracted.append((frame, frame_idx, timestamp))
                frame_count += 1

            frame_idx += 1

        cap.release()
        logger.info("Extracted %d frames from %d total", len(extracted), total_frames)
        return extracted

    def extract_snapshot(
        self,
        video_path: str,
        frame_index: int,
        output_path: str,
    ) -> bool:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return False

        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ret, frame = cap.read()
        cap.release()

        if ret:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            cv2.imwrite(output_path, frame)
            return True
        return False

    def annotate_frame(
        self,
        frame: np.ndarray,
        detections: list,
    ) -> np.ndarray:
        annotated = frame.copy()

        color_map = {
            "CRITICAL": (0, 0, 255),
            "HIGH": (0, 128, 255),
            "MEDIUM": (0, 255, 255),
            "LOW": (0, 255, 0),
            "NONE": (200, 200, 200),
        }

        for det in detections:
            bbox = det.get("bbox", {})
            x1 = int(bbox.get("x1", 0))
            y1 = int(bbox.get("y1", 0))
            x2 = int(bbox.get("x2", 0))
            y2 = int(bbox.get("y2", 0))

            level = det.get("threatLevel", "NONE")
            color = color_map.get(level, (200, 200, 200))

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            label = f"{det.get('label', '?')} {det.get('confidence', 0):.0%}"
            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
            )
            cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw, y1), color, -1)
            cv2.putText(
                annotated,
                label,
                (x1, y1 - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )

        return annotated

    def render_annotated_video(
        self,
        video_path: str,
        output_path: str,
        detections_by_frame: dict[int, list],
    ) -> bool:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return False

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_dets = detections_by_frame.get(frame_idx, [])
            if frame_dets:
                frame = self.annotate_frame(frame, frame_dets)

            writer.write(frame)
            frame_idx += 1

        cap.release()
        writer.release()
        return True
