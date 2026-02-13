  # Lyeria v1 Build Plan: Two-User Real-Time Collaborative Music Interface

  ## Summary

  Build a full-stack MVP from the empty repo using FastAPI + React/Vite/TypeScript + Three.js, with one shared Lyria stream per room, two synchronized
  controllers (A/B), and near-real-time PCM16 audio broadcast.
  The UX will prioritize a hero FFT-reactive liquid blob visualizer, with a top translucent transport bar, dynamic prompt-weight faders, and a two-state bottom
  sheet for remaining controls.
  Deployment target is Fly.io in DFW (us-central equivalent), with ephemeral in-memory room/session state and shareable room links (no auth) for v1.

  ## Scope (Locked)

  - Exactly 2 active controllers per room (A, B), no spectators in v1.
  - One backend-hosted Lyria session per room as source of truth.
  - Full control coverage for all documented controls:
    WeightedPrompt, guidance, bpm, density, brightness, scale, mute_bass, mute_drums, only_bass_and_drums, music_generation_mode, temperature, top_k, seed,
    plus playback commands.
  - PCM16 audio transport for MVP.
  - Mobile-first responsive UX with:
    Top translucent bar (Join, Play/Pause, BPM drag/tap/arrows, Scale dropdown).
    Prompt faders in main stage.
    Bottom sheet (half-open default + full-open advanced).

  ## Architecture

  - Frontend app (client/): React + TypeScript + Vite + react-three-fiber.
  - Backend app (server/): FastAPI + WebSocket endpoints + Lyria adapter service.
  - Shared contracts (shared/ or generated TS types from OpenAPI): event schemas, room state DTOs.
  - One WebSocket per client for control/state events.
  - One audio WebSocket endpoint per room for binary PCM chunks.
  - Server broadcasts:
    Control deltas to both users immediately.
    Room state snapshots on join/reconnect.
    Audio chunk fan-out from Lyria receive loop.

  ## Public APIs / Interfaces / Types

  - POST /api/rooms
    Creates room, returns roomId, join URL, initial role token for creator.
  - POST /api/rooms/{roomId}/join
    Assigns role A or B, rejects when full.
  - WS /ws/rooms/{roomId}/control?token=...
    Bidirectional JSON events.
  - WS /ws/rooms/{roomId}/audio?token=...
    Server-to-client binary PCM stream.
  - GET /api/rooms/{roomId}/state
    Current canonical room state (for hydration/debug).

  Core event types:

  - client.joined
  - control.patch
  - prompt.add
  - prompt.update_weight
  - prompt.remove
  - playback.command (play|pause|stop|reset_context)
  - server.state_snapshot
  - server.presence_update
  - server.error
  - server.audio_format (sample rate/channels metadata)

  Core shared types:

  - RoomState
  - PromptItem { id, text, weight, createdBy }
  - MusicConfig
  - ParticipantState { role, color, activeControl }
  - ControlPatch (partial updates with server-side canonical merge)

  ## Control Mapping (Decision Complete)

  - Dynamic on-screen prompt faders map to WeightedPrompt.weight (not global guidance).
  - Global guidance remains an advanced control in bottom sheet full state.
  - BPM default 130, editable by:
    Vertical drag with debounce.
    Tap-to-type numeric input.
    Increment/decrement arrows by 1.
  - Scale selectable from full Lyria scale enum list.
  - Generation mode segmented control:
    QUALITY (default), DIVERSITY, VOCALIZATION.
  - bpm and scale changes trigger backend reset_context() after applying full config.
  - All config updates send full MusicGenerationConfig payload to avoid unintended reset behavior.

  ## UX Implementation Spec

  - Hero stage:
    Full-screen liquid blob visualizer reactive to FFT bins and energy envelope.
    Color accents reflect active user (A=blue, B=red by default).
    Active manipulation glow on touched control, mirrored to remote user.
  - Top bar:
    Semi-transparent, fixed, includes Join, Play/Pause, BPM controls, Scale selector.
    Join is required user gesture gate for Safari audio start.
  - Prompt area:
    When prompt added, render a vertical fader in main stage beginning slightly above mid-screen.
    Fader color saturation/brightness increases with weight.
    Prompt label shown beneath each fader.
  - Bottom sheet:
    Half-open default shows: prompt input, mute_bass, mute_drums, only_bass_and_drums.
    Full-open adds horizontal faders: brightness, density, temperature, plus guidance, top_k, seed, and generation mode segmented control.
    Full-open capped to roughly 50% viewport height.
    Swipe/tap-outside behavior as specified.

  ## Backend Behavior

  - Room manager:
    In-memory dict keyed by roomId.
    Role assignment with atomic lock.
    Heartbeat and stale socket cleanup.
  - Lyria session service:
    One async task group per room:
    Receive audio loop.
    Control update queue.
    Broadcast worker with backpressure handling.
  - Broadcast and buffering:
    Short jitter buffer per client for smoother playout.
    Drop-oldest policy when client falls behind.
  - Reliability:
    Rehydrate reconnecting clients from canonical RoomState.
    Idempotent command handling with optional client event IDs.
  - Security v1:
    Signed short-lived join tokens scoped to room and role.
    Basic rate limiting by IP on room create/join and WS connect.

  ## Frontend Audio Pipeline

  - Browser AudioContext resumed only after Join.
  - PCM chunk decode path:
    Int16 -> Float32 conversion.
    Ring buffer + ScriptProcessor/AudioWorklet playout.
  - Basic adaptive jitter buffer:
    Target delay window tuned to keep <400ms steady-state.
    Underrun/overrun counters exposed in debug overlay.

  ## Repo Setup and Deliverables

  - server/ FastAPI service, Lyria adapter, room manager, WS handlers, tests.
  - client/ React app, visualization, control surfaces, room join flow.
  - infra/ Fly.io config (fly.toml), env var templates.
  - docs/ architecture, local runbook, latency tuning guide.
  - Root README.md with one-command local dev instructions and deployment steps.

  ## Testing and Acceptance Criteria

  Functional:

  - Two users join same room and see synchronized control movement in <120ms p95.
  - Prompt add/update/remove reflects on both clients and affects generation.
  - Playback commands work from either client and remain synchronized.
  - All required controls exist and map to backend correctly.

  Audio:

  - Both clients receive continuous PCM stream without frequent underruns.
  - Steady-state playout delay under 400ms p95 in Florida↔LA simulation profile.
  - Reconnect resumes stream/state without room reset.

  Mobile UX:

  - Top bar remains usable on iOS Safari and Android Chrome.
  - Bottom sheet gestures function correctly.
  - Visualizer remains primary visual focus and performs acceptably at 60fps target on modern devices.

  Resilience:

  - Disconnect one client: other continues uninterrupted.
  - Reconnect within timeout restores role/state.
  - Invalid tokens and third joiner are rejected predictably.

  Test suite:

  - Backend unit tests for state reducer, role assignment, config merge/reset rules.
  - Backend integration tests for WS event fan-out and audio broadcast contracts.
  - Frontend component tests for control-state mapping.
  - E2E Playwright tests for two-browser sync scenarios.
  - Lightweight load test for control events burst and audio fan-out.

  ## Rollout and Observability

  - Phase 1 local: two-tab and two-device tests.
  - Phase 2 staging on Fly DFW: coast-to-coast latency verification.
  - Phase 3 prod MVP: guarded room create endpoint and monitoring enabled.

  Metrics/logs:

  - WS connection counts, reconnects, control event latency p50/p95.
  - Audio buffer underrun/overrun rates.
  - Lyria session errors and reset_context frequency.
  - Per-room lifecycle logs with correlation IDs.

  ## Assumptions and Defaults

  - Gemini/Lyria API credentials are available via env vars at deploy time.
  - v1 has no accounts, no durable DB, no recording/replay storage.
  - Exactly two active collaborators only.
  - Prompt faders control WeightedPrompt.weight; global guidance is separate.
  - Hosting: Fly.io, DFW region.
  - Transport: PCM16 first; Opus deferred to post-MVP optimization.
  - Visual direction: clean pro studio with high-impact hero visualizer, not maximal effects.
