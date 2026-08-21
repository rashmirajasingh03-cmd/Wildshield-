# WildShield AI

AI-powered wildlife and forest security system that analyzes **uploaded
surveillance videos** and flags potential threats - illegal entry, poaching
indicators, weapons, traps, restricted-area human presence and risks to
endangered wildlife.

> **Scope note:** WildShield AI works exclusively with uploaded video/image
> files. There are no live cameras, IoT sensors, RTSP streams or hardware
> integrations. All AI findings are decision-support signals with confidence
> scores and must be verified by authorized personnel.

## Status: PHASE 1 - Project setup & service shells

| Component | State |
| --- | --- |
| Frontend (landing + login pages) | Done (Phase 1) |
| Node.js/Express backend + `/api/health` | Done (Phase 1) |
| Python FastAPI service + `/health` | Done (Phase 1) |
| MongoDB connection layer | Done (Phase 1) |
| Docker Compose (mongo + backend + ai) | Done (Phase 1) |
| Auth (JWT/bcrypt/roles) | Phase 3 |
| Video upload & storage | Phase 4 |
| YOLO detection pipeline | Phase 5 |
| Threat classification | Phase 6 |
| Full integration | Phase 7 |
| PDF reports | Phase 8 |

## Project structure

```
Wildshield/
├── frontend/          Static HTML/CSS/JS console
│   ├── index.html     Landing page
│   ├── login.html     Login page (connects in Phase 3)
│   ├── css/ js/ assets/
├── backend/           Node.js + Express API
│   ├── server.js      App entry (security middleware, health, static hosting)
│   ├── config/        env.js, db.js (Mongoose)
│   ├── controllers/ middleware/ models/ routes/ services/ utils/
│   └── uploads/       videos/ processed/ snapshots/ reports/
├── ai-service/        Python FastAPI microservice
│   ├── app.py         Shell + /health (YOLO arrives Phase 5)
│   ├── detection/     detector.py tracker.py classifier.py (stubs)
│   ├── services/      video_processor.py threat_analyzer.py (stubs)
│   └── models/        model weights (gitignored)
├── docs/              ARCHITECTURE.md
├── reports/           Generated analysis reports (output dir)
├── docker-compose.yml mongo + backend + ai-service
└── README.md
```

## Quick start (local development)

### 1. Backend (Node.js)

```powershell
cd backend
npm install
copy .env.example .env    # then edit values as needed
npm start                 # http://localhost:5000
```

Health check: <http://localhost:5000/api/health>

With `STATIC_FRONTEND=true` (default) the landing page is served at
<http://localhost:5000/> directly from the backend.

### 2. AI service (Python)

```powershell
cd ai-service
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env    # then edit values as needed
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Health check: <http://localhost:8000/health> - API docs: <http://localhost:8000/docs>

### 3. MongoDB

Any of:

- Local `mongod` on the default port, or
- `docker compose up -d mongo`, or
- A MongoDB Atlas URI in `backend/.env` (`MONGODB_URI`)

The backend starts even without MongoDB (degraded mode) so frontend/API work
is never blocked during development.

### 4. Docker Compose (all-in-one)

```powershell
docker compose up --build
```

## Environment variables

See [`backend/.env.example`](backend/.env.example) and
[`ai-service/.env.example`](ai-service/.env.example). Key settings:

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | 5000 | API port |
| `MONGODB_URI` | backend | mongodb://localhost:27017/wildshield | Database |
| `CORS_ORIGIN` | backend | localhost origins | Allowed browser origins |
| `STATIC_FRONTEND` | backend | true | Serve frontend from API origin |
| `JWT_SECRET` | backend | - | Required from Phase 3 |
| `AI_SERVICE_URL` | backend | http://localhost:8000 | AI service location |
| `DEMO_MODE` | both | false | Sample data (always labeled DEMO DATA) |
| `MODEL_PATH` | ai-service | models/yolo11n.pt | YOLO checkpoint (Phase 5) |
| `CONFIDENCE_THRESHOLD` | ai-service | 0.40 | Detection confidence cutoff |
| `IOU_THRESHOLD` | ai-service | 0.45 | NMS IoU threshold |
| `FRAME_INTERVAL` | ai-service | 10 | Process every Nth frame |

Never commit real `.env` files or secrets.

## Honesty & responsible-AI rules baked into the project

1. No fake AI results are generated before the real pipeline exists.
2. Stock YOLO models cannot reliably detect every weapon/species/trap; the
   architecture is built for a custom-trained model swap via `MODEL_PATH`.
3. Species-level claims require a model that supports those classes.
4. Findings use probabilistic wording ("Potential threat detected").
5. Demo-mode output is always labeled **DEMO DATA**.

## Documentation

- [System architecture](docs/ARCHITECTURE.md)
- [AI service README](ai-service/README.md)
