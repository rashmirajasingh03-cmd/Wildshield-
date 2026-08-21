# WildShield AI - System Architecture

## Overview

WildShield AI is an upload-based video analysis system for wildlife and forest
security. It has three independently deployable parts:

```
                 ┌────────────────────────┐
                 │   Frontend (static)    │
                 │  HTML/CSS/Vanilla JS   │
                 └───────────┬────────────┘
                             │ HTTP (fetch)
                             ▼
                 ┌────────────────────────┐
                 │  Node.js/Express API   │
                 │  auth · jobs · results │
                 └─────┬────────────┬─────┘
                       │            │
              ┌────────▼───┐   ┌────▼─────────┐
              │  MongoDB   │   │ File storage │
              │ (Mongoose) │   │ uploads/     │
              └────────────┘   └────┬─────────┘
                             ▼
                 ┌────────────────────────┐
                 │ Python AI service      │
                 │ FastAPI                │
                 └───────────┬────────────┘
                             ▼
                 ┌────────────────────────┐
                 │ OpenCV + YOLO pipeline │
                 │ frames → detections →  │
                 │ threat classification  │
                 └────────────────────────┘
```

## Data flow (target, after all phases)

1. Forest official logs in (JWT, roles: ADMIN / FOREST_OFFICIAL / VIEWER).
2. Video is uploaded via `POST /api/videos/upload` (Multer, validated type + size).
3. Backend creates a Video + Analysis record (`status: queued`) and dispatches the
   file to the Python service (`POST /analyze/video`).
4. The AI service samples frames every `FRAME_INTERVAL` frames, runs YOLO,
   tracks objects, classifies threats and returns structured JSON.
5. Backend persists Analysis + Detection documents and snapshot paths.
6. Dashboard renders summaries, timeline, table; reports are generated as PDF.

## Storage layout

```
backend/uploads/
├── videos/      original uploads (never stored in MongoDB)
├── processed/   annotated videos
├── snapshots/   frame captures per detection
└── reports/     generated PDFs
```

The storage layer is isolated in backend services so it can be swapped for
S3 / GCS / Firebase Storage by reimplementing one module.

## AI model strategy (honesty first)

- Phase 5 ships with a **stock pretrained YOLO checkpoint** as a placeholder.
- Stock COCO classes cover: person, car/truck (vehicle), knife, backpack.
- They do **not** reliably cover: weapons beyond knives, animal species,
  traps. The system therefore:
  - maps only classes the loaded model actually supports,
  - keeps generic "animal" separate from species-level claims,
  - exposes `MODEL_PATH` so a custom-trained wildlife/security model can be
    dropped in without code changes.
- Threat classification is rule-based and configurable; wording is always
  probabilistic ("Potential threat detected"), never an accusation.
- Demo mode output is always labeled **DEMO DATA**.

## Security posture

| Control | Implementation |
| --- | --- |
| Passwords | bcrypt hashing (Phase 3) |
| Sessions | JWT bearer tokens, role-based guards (Phase 3) |
| Uploads | extension + MIME allowlist, size cap, randomized safe filenames (Phase 4) |
| Transport headers | Helmet |
| Abuse control | express-rate-limit on `/api` |
| Secrets | `.env` files only, `.env.example` committed, real `.env` gitignored |

## Extension points

- **Custom model**: replace `ai-service/models/*.pt`, update class mapping config.
- **Cloud storage**: implement the storage interface against S3/GCS.
- **More threat rules**: rules are data-driven config, not hard-coded logic.
