# WildShield AI Service

Python microservice responsible for video analysis (FastAPI + OpenCV + YOLO,
extended with VideoMAE temporal action recognition).

## Status: Phase 7 (YOLO + VideoMAE fusion)

Implemented:

- FastAPI app with CORS
- `GET /health` / `GET /` - health/config endpoints for the Node backend and Docker
- Environment-driven configuration (`MODEL_PATH`, `CONFIDENCE_THRESHOLD`,
  `IOU_THRESHOLD`, `FRAME_INTERVAL`, `DEVICE`, `VIDEOMAE_*`)
- YOLO object detection (`detection/detector.py`)
- Threat classification (`services/threat_analyzer.py`)
- Temporal VideoMAE action recognition (`models/videomae_classifier.py`)
- YOLO + VideoMAE fusion (`services/videomae_analyzer.py`)
- `POST /analyze/video` - end-to-end analysis

## Run locally

```powershell
cd ai-service
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then edit values
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API docs: <http://localhost:8000/docs>

> **GPU / CPU:** set `DEVICE=auto` (default). The service automatically uses a
> CUDA GPU when available and falls back to CPU otherwise. For GPU install the
> CUDA build of torch (see https://pytorch.org/get-started/locally/) - the CPU
> wheel keeps the app runnable on machines without CUDA.

## VideoMAE - honest usage

- `VIDEOMAE_MODEL_NAME` (default `MCG-NJU/videomae-base`) is a **generic
  pretrained video representation** model. It does NOT recognize Wildshield
  wildlife-crime classes.
- When `VIDEOMAE_CHECKPOINT` is empty the service runs in
  **PRETRAINED / MODEL-DEVELOPMENT mode** and does NOT fabricate predictions
  for custom classes.
- Set `VIDEOMAE_CHECKPOINT` to a Wildshield-specific fine-tuned checkpoint
  (trained from the `dataset/` layout) to enable real custom-class analysis.
- Temporal sampling: `VIDEOMAE_NUM_FRAMES` (default 16) frames are sampled
  evenly from the clip and fed to VideoMAE as a sequence; frames are never
  sent frame-by-frame.

## Honesty requirements (project rules)

- A stock pretrained YOLO model cannot reliably detect every weapon, species
  or trap. The detector is designed so a custom-trained checkpoint can replace
  it via `MODEL_PATH`.
- Species-level claims are only made when the loaded model actually supports
  those classes.
- A stock VideoMAE model is a generic feature extractor; wildlife-crime action
  claims require a fine-tuned checkpoint AND evaluation on a held-out test set.
- If `DEMO_MODE=true`, all simulated results must be labeled **DEMO DATA**.
