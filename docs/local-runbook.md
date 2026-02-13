# Local Runbook

## 1. Start backend

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## 2. Start frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` in two browsers/devices, share the room URL, then click `Join` on each client.

## 3. Validate key behavior

- Both users see each other’s control motion and glow color.
- Prompt add spawns a new fader on both clients.
- Audio plays only after Join gesture.
- `bpm` and `scale` changes trigger context reset behavior.
