# Architecture

## Core topology

- Server is single source of truth for each room.
- One Lyria session per room.
- Two WebSocket channels per client:
  - JSON control channel for state sync.
  - Binary PCM channel for audio playout.

## Backend components

- `app.main`: HTTP + WebSocket entrypoints.
- `app.room_manager`: room state, role reservation, participant presence, broadcast fan-out.
- `app.lyria`: session adapter (mock generator today, Gemini adapter stubbed).
- `app.token_utils`: HMAC-signed room/role tokens.

## Frontend components

- `useRoomSession`: room bootstrap, join flow, WS lifecycle.
- `PcmAudioEngine`: PCM16 queue + WebAudio playback + FFT feed.
- `LiquidBlob`: FFT-reactive hero visualizer.
- `TopBar`: join/play, bpm controls, scale dropdown.
- `PromptFaders`: dynamic prompt-weight controls.
- `BottomSheet`: top-tier + advanced controls.
