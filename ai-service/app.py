"""
WildShield AI - Python microservice

FastAPI application with YOLO detection pipeline, threat classification,
and video analysis endpoints.
"""

import time
import uuid
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from utils.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="WildShield AI Service",
    version="0.2.0",
    description="Video analysis microservice with YOLO detection and threat classification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Global detector instance (loaded lazily)
_detector = None
_processor = None
_analyzer = None


def _get_detector():
    global _detector
    if _detector is None:
        from detection.detector import Detector

        _detector = Detector(
            model_path=settings.model_path,
            confidence_threshold=settings.confidence_threshold,
            iou_threshold=settings.iou_threshold,
            device=settings.device,
        )
        _detector.load()
    return _detector


def _get_processor():
    global _processor
    if _processor is None:
        from services.video_processor import VideoProcessor

        _processor = VideoProcessor(frame_interval=settings.frame_interval)
    return _processor


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        from services.threat_analyzer import ThreatAnalyzer

        _analyzer = ThreatAnalyzer()
    return _analyzer


class AnalyzeVideoRequest(BaseModel):
    analysis_id: str
    video_path: str
    confidence_threshold: float = 0.4
    iou_threshold: float = 0.45
    frame_interval: int = 10


class AnalyzeVideoResponse(BaseModel):
    analysis_id: str
    status: str
    detections: list = []
    summary: dict = {}
    frames_analyzed: int = 0
    total_frames: int = 0
    processing_time_ms: float = 0
    processed_video: str | None = None


@app.get("/")
async def root():
    detector = _get_detector()
    return {
        "service": "wildshield-ai-service",
        "version": "0.2.0",
        "phase": 5,
        "capabilities": {
            "video_analysis": True,
            "object_detection": detector.is_loaded,
            "threat_classification": True,
            "annotated_video": detector.is_loaded,
        },
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    detector = _get_detector()
    return {
        "status": "ok",
        "service": "wildshield-ai-service",
        "version": "0.2.0",
        "environment": settings.environment,
        "model": {
            "loaded": detector.is_loaded,
            "path": settings.model_path,
        },
        "config": {
            "confidence_threshold": settings.confidence_threshold,
            "iou_threshold": settings.iou_threshold,
            "frame_interval": settings.frame_interval,
            "device": settings.device,
        },
        "demo_mode": settings.demo_mode,
    }


@app.post("/analyze/video", response_model=AnalyzeVideoResponse)
async def analyze_video(req: AnalyzeVideoRequest):
    start_time = time.time()

    video_path = Path(req.video_path)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video not found: {req.video_path}")

    processor = _get_processor()
    detector = _get_detector()
    analyzer = _get_analyzer()

    # Get video info
    video_info = processor.get_video_info(req.video_path)
    total_frames = video_info.get("total_frames", 0)

    if not detector.is_loaded:
        # Demo mode: return simulated detections
        if settings.demo_mode:
            demo_detections = _generate_demo_detections(req.analysis_id)
            processing_ms = (time.time() - start_time) * 1000
            return AnalyzeVideoResponse(
                analysis_id=req.analysis_id,
                status="completed",
                detections=demo_detections["detections"],
                summary=demo_detections["summary"],
                frames_analyzed=min(10, total_frames),
                total_frames=total_frames,
                processing_time_ms=round(processing_ms, 2),
            )
        raise HTTPException(
            status_code=503,
            detail="YOLO model not loaded. Set MODEL_PATH and ensure model file exists.",
        )

    # Extract frames
    frames = processor.extract_frames(req.video_path)
    if not frames:
        processing_ms = (time.time() - start_time) * 1000
        return AnalyzeVideoResponse(
            analysis_id=req.analysis_id,
            status="completed",
            detections=[],
            summary={},
            frames_analyzed=0,
            total_frames=total_frames,
            processing_time_ms=round(processing_ms, 2),
        )

    # Run detection on all frames
    all_detections = []
    for frame, frame_idx, timestamp in frames:
        dets = detector.detect(frame, frame_idx, timestamp)
        all_detections.extend(dets)

    # Threat analysis
    analysis_result = analyzer.analyze(all_detections)

    # Generate annotated video
    processed_path = None
    detections_by_frame = {}
    for d in analysis_result["detections"]:
        fidx = d["frame_index"]
        if fidx not in detections_by_frame:
            detections_by_frame[fidx] = []
        detections_by_frame[fidx].append(d)

    output_dir = Path(req.video_path).parent.parent / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)
    processed_path = str(output_dir / f"annotated_{req.analysis_id}.mp4")

    try:
        processor.render_annotated_video(req.video_path, processed_path, detections_by_frame)
    except Exception as e:
        logger.warning("Failed to render annotated video: %s", e)
        processed_path = None

    processing_ms = (time.time() - start_time) * 1000

    return AnalyzeVideoResponse(
        analysis_id=req.analysis_id,
        status="completed",
        detections=analysis_result["detections"],
        summary={
            "total_detections": analysis_result["total_detections"],
            "threats_found": analysis_result["threats_found"],
            "highest_threat": analysis_result["highest_threat"],
            "unique_labels": list(analysis_result["label_counts"].keys()),
            "threat_counts": analysis_result["threat_counts"],
            "category_counts": analysis_result["category_counts"],
        },
        frames_analyzed=len(frames),
        total_frames=total_frames,
        processing_time_ms=round(processing_ms, 2),
        processed_video=processed_path,
    )


def _generate_demo_detections(analysis_id: str) -> dict:
    import random

    demo_labels = [
        ("person", "MEDIUM", "unauthorized_entry"),
        ("car", "MEDIUM", "vehicle_intrusion"),
        ("truck", "HIGH", "vehicle_intrusion"),
        ("deer", "LOW", "wildlife"),
        ("fire", "HIGH", "environmental_threat"),
        ("knife", "HIGH", "weapon"),
    ]

    n = random.randint(2, 5)
    chosen = random.sample(demo_labels, n)
    detections = []

    for i, (label, level, category) in enumerate(chosen):
        x1 = random.randint(100, 800)
        y1 = random.randint(100, 500)
        detections.append({
            "label": label,
            "confidence": round(random.uniform(0.45, 0.95), 4),
            "bbox": {"x1": x1, "y1": y1, "x2": x1 + 120, "y2": y1 + 160},
            "frame_index": i * 10,
            "timestamp": round(i * 2.5, 2),
            "threatLevel": level,
            "threatCategory": category,
        })

    threat_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "NONE": 0}
    for d in detections:
        threat_counts[d["threatLevel"]] += 1

    return {
        "detections": detections,
        "summary": {
            "total_detections": len(detections),
            "threats_found": sum(1 for d in detections if d["threatLevel"] != "NONE"),
            "highest_threat": max(
                (d["threatLevel"] for d in detections),
                key=lambda x: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"].index(x),
            ),
            "unique_labels": list(set(d["label"] for d in detections)),
            "threat_counts": threat_counts,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
