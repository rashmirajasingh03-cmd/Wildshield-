"""
WildShield AI - Python microservice (Phase 1)

Current scope:
    - FastAPI application shell
    - /health endpoint for orchestration and the Node backend
    - Configuration via environment variables (.env)

NOT implemented yet (by design, per build plan):
    - YOLO inference / model loading          -> Phase 5
    - Video frame extraction (OpenCV)         -> Phase 5
    - Object tracking                         -> Phase 5
    - Threat classification                   -> Phase 6
    - Annotated video / snapshot generation   -> Phase 5

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.config import get_settings

settings = get_settings()

app = FastAPI(
    title="WildShield AI Service",
    version="0.1.0",
    description=(
        "Video analysis microservice for WildShield AI. "
        "Phase 1: service shell + health check only. "
        "YOLO detection, frame extraction and threat analysis arrive in later phases."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Service banner."""
    return {
        "service": "wildshield-ai-service",
        "version": "0.1.0",
        "phase": 1,
        "capabilities": {
            "video_analysis": False,
            "object_detection": False,
            "threat_classification": False,
            "annotated_video": False,
        },
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    """
    Health check consumed by the Node.js backend and docker healthchecks.
    `model_loaded` is always False until Phase 5 wires in YOLO.
    """
    return {
        "status": "ok",
        "service": "wildshield-ai-service",
        "version": "0.1.0",
        "environment": settings.environment,
        "model": {
            "loaded": False,
            "path": settings.model_path,
            "note": "Model loading is implemented in Phase 5",
        },
        "config": {
            "confidence_threshold": settings.confidence_threshold,
            "iou_threshold": settings.iou_threshold,
            "frame_interval": settings.frame_interval,
            "device": settings.device,
        },
        "demo_mode": settings.demo_mode,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
