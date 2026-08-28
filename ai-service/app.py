"""
WildShield AI - Python microservice

FastAPI application with YOLO detection pipeline, threat classification,
and video analysis endpoints.

NO fake/demo results. Real model inference only.
"""

import time
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
    version="0.3.0",
    description="Video analysis microservice with YOLO detection and threat classification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

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
        "version": "0.3.0",
        "phase": 5,
        "capabilities": {
            "video_analysis": True,
            "object_detection": detector.is_loaded,
            "threat_classification": True,
            "annotated_video": detector.is_loaded,
        },
        "model": {
            "loaded": detector.is_loaded,
            "path": settings.model_path,
            "classes": detector.get_classes(),
            "handles": detector.handles_labels(),
        },
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    detector = _get_detector()
    return {
        "status": "ok",
        "service": "wildshield-ai-service",
        "version": "0.3.0",
        "environment": settings.environment,
        "model": {
            "loaded": detector.is_loaded,
            "path": settings.model_path,
            "classes_count": len(detector.get_classes()),
            "handles": detector.handles_labels(),
        },
        "config": {
            "confidence_threshold": settings.confidence_threshold,
            "iou_threshold": settings.iou_threshold,
            "frame_interval": settings.frame_interval,
            "device": settings.device,
        },
        "demo_mode": False,
    }


@app.post("/analyze/video", response_model=AnalyzeVideoResponse)
async def analyze_video(req: AnalyzeVideoRequest):
    start_time = time.time()

    video_path = Path(req.video_path)
    if not video_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Video file not found: {req.video_path}"
        )

    detector = _get_detector()

    if not detector.is_loaded:
        raise HTTPException(
            status_code=503,
            detail=(
                "YOLO model is not loaded. "
                "Download yolo11n.pt from https://github.com/ultralytics/assets "
                "and place it in ai-service/models/yolo11n.pt, then restart the service."
            ),
        )

    processor = _get_processor()
    analyzer = _get_analyzer()

    video_info = processor.get_video_info(req.video_path)
    if "error" in video_info:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot read video: {video_info['error']}",
        )
    total_frames = video_info.get("total_frames", 0)

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

    all_detections = []
    for frame, frame_idx, timestamp in frames:
        dets = detector.detect(frame, frame_idx, timestamp)
        all_detections.extend(dets)

    analysis_result = analyzer.analyze(all_detections)

    detections_by_frame = {}
    for d in analysis_result["detections"]:
        fidx = d["frame_index"]
        if fidx not in detections_by_frame:
            detections_by_frame[fidx] = []
        detections_by_frame[fidx].append(d)

    processed_path = None
    output_dir = Path(req.video_path).parent.parent / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)
    processed_path = str(output_dir / f"annotated_{req.analysis_id}.mp4")

    try:
        processor.render_annotated_video(
            req.video_path, processed_path, detections_by_frame
        )
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
            "threat_events": analysis_result["threat_events"],
        },
        frames_analyzed=len(frames),
        total_frames=total_frames,
        processing_time_ms=round(processing_ms, 2),
        processed_video=processed_path,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
