# Lyeria Backend

FastAPI service for two-user collaborative Lyria control and PCM audio fan-out.

## Run locally

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
cd server
pytest
```

## API summary

- `POST /api/rooms`
- `POST /api/rooms/{room_id}/join`
- `GET /api/rooms/{room_id}/state`
- `WS /ws/rooms/{room_id}/control?token=...`
- `WS /ws/rooms/{room_id}/audio?token=...`

## Lyria runtime

- `USE_MOCK_LYRIA=true` uses the built-in PCM generator for development.
- `USE_MOCK_LYRIA=false` with `GEMINI_API_KEY` enables live Gemini Lyria connection (with automatic fallback to mock if unavailable).
