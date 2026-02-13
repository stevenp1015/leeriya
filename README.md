# Lyeria

Real-time two-user collaborative music generation interface (FastAPI + React + Three.js) with synchronized controls and low-latency PCM streaming.

## Monorepo layout

- `server/` FastAPI backend, room/session state, control + audio WebSockets
- `client/` React/Vite app, hero visualizer, transport and control surfaces
- `infra/` deployment config (`fly.toml`)
- `docs/` architecture and operational runbooks

## Quick start

### 1) Backend

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2) Frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` and share the generated room URL with a second user/device.

## MVP capabilities implemented

- Share-link rooms with exactly two controllers (`A` / `B`)
- Tokenized room join and role assignment
- Synchronized control state over JSON WebSockets
- Binary PCM16 audio fan-out channel from server to all room clients
- Hero FFT-reactive liquid blob visualizer
- Top translucent bar: Join, Play/Pause, BPM drag/tap/arrows, Scale dropdown
- Dynamic prompt-weight faders in main stage
- Bottom sheet controls with half-open and full-open states
- Full control coverage for documented Lyria controls (prompts + config + playback)

## Deploy (Fly.io, DFW)

1. Install and authenticate Fly CLI.
2. Configure secrets:

```bash
flyctl secrets set TOKEN_SECRET=... GEMINI_API_KEY=...
```

3. Deploy:

```bash
flyctl deploy --config infra/fly.toml
```

## Notes

- Runtime defaults to a mock Lyria audio generator unless `USE_MOCK_LYRIA=false` and `GEMINI_API_KEY` is set.
- `bpm` and `scale` patches trigger context reset behavior server-side.
