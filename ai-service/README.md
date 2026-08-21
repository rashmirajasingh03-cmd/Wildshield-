# WildShield AI Service

Python microservice responsible for video analysis (FastAPI + OpenCV + YOLO).

## Status: Phase 1 (service shell)

Implemented:

- FastAPI app with CORS
- `GET /health` - health/config endpoint for the Node backend and Docker
- Environment-driven configuration (`MODEL_PATH`, `CONFIDENCE_THRESHOLD`,
  `IOU_THRESHOLD`, `FRAME_INTERVAL`, `DEVICE`, `DEMO_MODE`)

Not implemented yet (per build plan):

- YOLO inference, frame extraction, tracking -> **Phase 5**
- Threat classification -> **Phase 6**
- Integration with the Node backend -> **Phase 7**

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

## Planned endpoints

| Endpoint            | Phase | Purpose                                  |
| ------------------- | ----- | ---------------------------------------- |
| `GET /health`       | 1     | Health + active configuration            |
| `POST /analyze/video` | 5   | Accept uploaded video, run detection     |
| `GET /jobs/{id}`    | 5     | Poll async analysis job status           |

## Honesty requirements (project rules)

- A stock pretrained YOLO model cannot reliably detect every weapon,
  species or trap. The detector is designed so a custom-trained
  wildlife/security checkpoint can replace it via `MODEL_PATH`.
- Species-level claims are only made when the loaded model actually
  supports those classes.
- If `DEMO_MODE=true`, all simulated results must be labeled **DEMO DATA**.
