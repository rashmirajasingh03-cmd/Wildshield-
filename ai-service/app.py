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


@app.on_event("startup")
async def _startup_load_videomae():
    """
    Optionally preload VideoMAE at startup (VIDEOMAE_EAGER_LOAD=true).

    Default is lazy load on first analysis so that a slow CPU model load never
    blocks the /health probe or API startup. Loading runs in a background
    thread so the event loop stays responsive.
    """
    if not settings.videomae_eager_load:
        return

    def _load():
        try:
            _get_videomae()
        except Exception as e:  # pragma: no cover - defensive
            logger.error("VideoMAE eager load failed: %s", e)

    import threading

    threading.Thread(target=_load, daemon=True).start()


_detector = None
_processor = None
_analyzer = None
_videomae = None


def _get_detector():
    global _detector
    if _detector is None:
        from detection.detector import Detector

        _detector = Detector(
            model_path=settings.model_path,
            confidence_threshold=settings.confidence_threshold,
            iou_threshold=settings.iou_threshold,
            device=settings.resolved_device,
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


def _get_videomae():
    """
    Lazy, once-only load of the VideoMAE classifier.

    Model loading is kept out of the route handlers. If VideoMAE fails to
    load (e.g. missing torch/transformers or an invalid checkpoint) the
    service degrades gracefully: YOLO analysis still works and the response
    flags VideoMAE as unavailable rather than crashing the API.
    """
    global _videomae
    if _videomae is None:
        try:
            from models.videomae_classifier import VideoMAEClassifier

            _videomae = VideoMAEClassifier(
                model_name=settings.videomae_model_name,
                checkpoint=settings.videomae_checkpoint or None,
                num_frames=settings.videomae_num_frames,
                confidence_threshold=settings.videomae_confidence_threshold,
                device=settings.resolved_device,
            )
            _videomae.load()
            logger.info(
                "VideoMAE classifier ready (mode=%s, device=%s)",
                _videomae.mode_label,
                settings.resolved_device,
            )
        except Exception as e:
            logger.error("VideoMAE classifier failed to load: %s", e)
            _videomae = None
    return _videomae


def _videomae_status() -> dict:
    """
    Lightweight, non-loading VideoMAE status for / and /health.

    Does NOT trigger model loading (which can be slow on CPU) so health probes
    stay fast. The model itself loads lazily once on the first analysis.
    """
    vmae = _videomae
    loaded = vmae is not None and vmae.is_loaded
    if loaded:
        mode = vmae.mode_label
        limit = (
            "Fine-tuned Wildshield checkpoint loaded."
            if vmae.is_finetuned
            else (
                "Pretrained/Model-development mode: no Wildshield fine-tuned "
                "checkpoint loaded, custom wildlife-crime classes are NOT claimed."
            )
        )
    else:
        mode = "not_loaded"
        limit = (
            "VideoMAE not yet loaded. The classifier will load on the first "
            "video analysis, or set VIDEOMAE_EAGER_LOAD=true to load at startup."
        )
    return {
        "loaded": loaded,
        "mode": mode,
        "model_name": settings.videomae_model_name,
        "checkpoint": settings.videomae_checkpoint or None,
        "num_frames": settings.videomae_num_frames,
        "device": settings.resolved_device,
        "limit": limit,
    }


class AnalyzeVideoRequest(BaseModel):
    analysis_id: str
    video_path: str
    confidence_threshold: float = 0.4
    iou_threshold: float = 0.45
    frame_interval: int = 10
    render_annotated: bool = False


class AnalyzeVideoResponse(BaseModel):
    analysis_id: str
    status: str
    result: dict = {}
    frames_analyzed: int = 0
    total_frames: int = 0
    processing_time_ms: float = 0
    processed_video: str | None = None


@app.get("/")
async def root():
    detector = _get_detector()
    vmae_status = _videomae_status()
    return {
        "service": "wildshield-ai-service",
        "version": "0.4.0",
        "phase": 7,
        "capabilities": {
            "video_analysis": True,
            "object_detection": detector.is_loaded,
            "threat_classification": True,
            "temporal_action_recognition": vmae_status["loaded"],
            "annotated_video": detector.is_loaded,
        },
        "model": {
            "loaded": detector.is_loaded,
            "path": settings.model_path,
            "classes": detector.get_classes(),
            "handles": detector.handles_labels(),
        },
        "videomae": vmae_status,
        "device": settings.resolved_device,
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    detector = _get_detector()
    vmae_status = _videomae_status()
    return {
        "status": "ok",
        "service": "wildshield-ai-service",
        "version": "0.4.0",
        "environment": settings.environment,
        "model": {
            "loaded": detector.is_loaded,
            "path": settings.model_path,
            "classes_count": len(detector.get_classes()),
            "handles": detector.handles_labels(),
        },
        "videomae": vmae_status,
        "config": {
            "confidence_threshold": settings.confidence_threshold,
            "iou_threshold": settings.iou_threshold,
            "frame_interval": settings.frame_interval,
            "device": settings.resolved_device,
            "videomae_num_frames": settings.videomae_num_frames,
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

    # --- YOLO analysis (unchanged pipeline) ---
    frames = processor.extract_frames(req.video_path)
    frames_extracted = list(frames)
    all_detections = []
    for frame, frame_idx, timestamp in frames_extracted:
        dets = detector.detect(frame, frame_idx, timestamp)
        all_detections.extend(dets)

    # --- VideoMAE temporal analysis (sequence of sampled frames) ---
    videomae_detail = None
    vmae_loaded = False
    vmae = _get_videomae()
    if vmae is not None and vmae.is_loaded:
        vmae_loaded = True
        vmae_start = time.time()
        try:
            sampled = vmae.sample_frames(req.video_path)
            vmae_result = vmae.classify_clip(sampled) if sampled else {}
            videomae_detail = {
                **vmae_result,
                "model_loaded": True,
                "sampled_frames": vmae.sampled_frames,
                "analyzed_frames": vmae.analyzed_frames,
                "num_frames": settings.videomae_num_frames,
                "processing_time_ms": round(
                    (time.time() - vmae_start) * 1000, 2
                ),
            }
        except Exception as e:
            logger.error("VideoMAE analysis failed; continuing with YOLO only: %s", e)
            videomae_detail = {
                "mode": "error",
                "model_loaded": False,
                "action_class": None,
                "action_confidence": 0.0,
                "sampled_frames": 0,
                "analyzed_frames": 0,
                "processing_time_ms": 0,
                "error": str(e),
            }
    elif vmae is not None:
        # Loaded but unavailable (fallback state) -> report honestly.
        videomae_detail = {
            "mode": "not_loaded",
            "model_loaded": False,
            "action_class": None,
            "action_confidence": 0.0,
            "sampled_frames": 0,
            "analyzed_frames": 0,
            "processing_time_ms": 0,
        }
    else:
        videomae_detail = {
            "mode": "not_loaded",
            "model_loaded": False,
            "action_class": None,
            "action_confidence": 0.0,
            "sampled_frames": 0,
            "analyzed_frames": 0,
            "processing_time_ms": 0,
            "error": "VideoMAE dependencies/checkpoint unavailable.",
        }

    # --- Combine YOLO + VideoMAE through the threat-analysis layer ---
    from services.videomae_analyzer import ThreatAnalyzerV2

    fusion = ThreatAnalyzerV2().analyze(all_detections, videomae_detail)

    # --- Legacy rule-based verdict for backward compatibility ---
    # If no frames were extracted, produce the standard no-threat envelope.
    if not frames_extracted:
        processing_ms = (time.time() - start_time) * 1000
        return AnalyzeVideoResponse(
            analysis_id=req.analysis_id,
            status="completed",
            result={
                "verdict": "NO_THREAT",
                "message": "No animal attack, harm, or abuse was detected.",
                "incident": None,
                "incidents_count": 0,
                **fusion,
            },
            frames_analyzed=0,
            total_frames=total_frames,
            processing_time_ms=round(processing_ms, 2),
        )

    # Keep the existing YOLO rule-based incident output for the frontend.
    legacy_result = analyzer.analyze(all_detections)

    # Internal annotated detections are used for the boxed video only.
    detections_by_frame = {}
    for d in legacy_result.get("detections", []):
        fidx = d["frame_index"]
        if fidx not in detections_by_frame:
            detections_by_frame[fidx] = []
        detections_by_frame[fidx].append(d)

    result_payload = {
        k: v for k, v in legacy_result.items() if k != "detections"
    }
    # Merge the new VideoMAE fusion fields into the response envelope.
    result_payload.update(fusion)

    processed_path = None
    if settings.render_annotated_video or req.render_annotated:
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
        result=result_payload,
        frames_analyzed=len(frames_extracted),
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
