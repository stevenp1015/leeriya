from __future__ import annotations

import asyncio
import logging
import math
from collections.abc import Awaitable, Callable
from typing import Any
from typing import Optional, Protocol

from app.models import MusicConfig, PlaybackState, RoomState

logger = logging.getLogger(__name__)

AudioChunkCallback = Callable[[bytes], Awaitable[None]]


class LyriaSession(Protocol):
    async def start(self) -> None: ...

    async def close(self) -> None: ...

    async def apply_state(self, state: RoomState) -> None: ...

    async def play(self) -> None: ...

    async def pause(self) -> None: ...

    async def stop(self) -> None: ...

    async def reset_context(self) -> None: ...


class MockLyriaSession:
    """Low-latency PCM16 stereo generator for local dev and integration testing."""

    sample_rate_hz = 48_000
    channels = 2
    frame_ms = 20

    def __init__(self, on_audio_chunk: AudioChunkCallback) -> None:
        self._on_audio_chunk = on_audio_chunk
        self._running = False
        self._playing = False
        self._task: Optional[asyncio.Task[None]] = None
        self._phase = 0.0
        self._config = MusicConfig()
        self._prompt_weights: list[float] = []
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name="mock-lyria-loop")

    async def close(self) -> None:
        self._running = False
        self._playing = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def apply_state(self, state: RoomState) -> None:
        async with self._lock:
            self._config = state.music_config
            self._prompt_weights = [p.weight for p in state.prompts]

            if state.playback_state == PlaybackState.playing:
                self._playing = True
            elif state.playback_state == PlaybackState.paused:
                self._playing = False
            elif state.playback_state == PlaybackState.stopped:
                self._playing = False
                self._phase = 0.0

    async def play(self) -> None:
        self._playing = True

    async def pause(self) -> None:
        self._playing = False

    async def stop(self) -> None:
        self._playing = False
        self._phase = 0.0

    async def reset_context(self) -> None:
        self._phase = 0.0

    async def _run(self) -> None:
        frame_count = int(self.sample_rate_hz * self.frame_ms / 1000)
        sleep_seconds = self.frame_ms / 1000.0

        while self._running:
            if self._playing:
                chunk = self._render_pcm16_stereo(frame_count)
                await self._on_audio_chunk(chunk)
            await asyncio.sleep(sleep_seconds)

    def _render_pcm16_stereo(self, frame_count: int) -> bytes:
        cfg = self._config

        prompt_bias = sum(self._prompt_weights) / max(len(self._prompt_weights), 1)
        base_freq = 90.0 + (cfg.bpm * 0.55) + (cfg.brightness * 180.0) + (prompt_bias * 8.0)
        lfo_freq = 0.35 + (cfg.density * 0.8)

        guidance_mix = max(0.05, min(cfg.guidance / 6.0, 1.0))
        amplitude = 0.12 + (cfg.density * 0.26)
        if cfg.mute_bass:
            amplitude *= 0.7
        if cfg.only_bass_and_drums:
            amplitude *= 0.85

        if cfg.music_generation_mode.value == "DIVERSITY":
            base_freq *= 1.07
        elif cfg.music_generation_mode.value == "VOCALIZATION":
            base_freq *= 1.18

        step = 2.0 * math.pi * base_freq / self.sample_rate_hz
        lfo_step = 2.0 * math.pi * lfo_freq / self.sample_rate_hz

        pcm = bytearray(frame_count * self.channels * 2)
        write_index = 0

        for idx in range(frame_count):
            lfo = math.sin((self._phase * 0.08) + (idx * lfo_step))
            carrier = math.sin(self._phase + (idx * step))
            overtone = math.sin((self._phase * 1.9) + (idx * step * 1.92))

            sample = (carrier * (0.75 + (0.25 * guidance_mix))) + (overtone * 0.35 * (0.5 + guidance_mix))
            sample *= (1.0 + 0.25 * lfo)
            sample *= amplitude

            if cfg.mute_drums:
                sample *= 0.8

            left = max(-1.0, min(1.0, sample))
            right = max(-1.0, min(1.0, (sample * 0.92) + (0.08 * math.sin(self._phase * 0.5))))

            left_i = int(left * 32767.0)
            right_i = int(right * 32767.0)

            pcm[write_index : write_index + 2] = int(left_i).to_bytes(2, byteorder="little", signed=True)
            pcm[write_index + 2 : write_index + 4] = int(right_i).to_bytes(
                2, byteorder="little", signed=True
            )
            write_index += 4

        self._phase += frame_count * step
        if self._phase > 10_000:
            self._phase %= 10_000

        return bytes(pcm)


class GoogleLyriaSession:
    """Gemini Lyria live adapter with automatic mock fallback."""

    def __init__(self, on_audio_chunk: AudioChunkCallback, api_key: str, model: str) -> None:
        self._on_audio_chunk = on_audio_chunk
        self._api_key = api_key
        self._model = model
        self._mock_fallback = MockLyriaSession(on_audio_chunk)
        self._using_mock = False

        self._genai_module: Any | None = None
        self._types_module: Any | None = None
        self._client: Any | None = None
        self._session_ctx: Any | None = None
        self._session: Any | None = None

        self._recv_task: Optional[asyncio.Task[None]] = None
        self._running = False
        self._latest_state: RoomState | None = None

    async def start(self) -> None:
        if self._running:
            return

        try:
            await self._start_real_session()
            self._running = True
        except Exception:
            logger.exception("Failed to initialize real Lyria session; falling back to mock")
            self._using_mock = True
            await self._mock_fallback.start()
            self._running = True

    async def close(self) -> None:
        if self._using_mock:
            await self._mock_fallback.close()
            self._running = False
            return

        self._running = False
        if self._recv_task:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass
            self._recv_task = None

        if self._session_ctx is not None:
            try:
                await self._session_ctx.__aexit__(None, None, None)
            except Exception:
                logger.exception("Failed to close Gemini live session cleanly")
            finally:
                self._session_ctx = None
                self._session = None

    async def apply_state(self, state: RoomState) -> None:
        self._latest_state = state
        if self._using_mock:
            await self._mock_fallback.apply_state(state)
            return

        session = self._session
        if session is None:
            return

        await self._apply_prompts(state)
        await self._apply_config(state)

        if state.playback_state == PlaybackState.playing:
            await session.play()
        elif state.playback_state == PlaybackState.paused:
            await session.pause()
        elif state.playback_state == PlaybackState.stopped:
            await session.stop()

    async def play(self) -> None:
        if self._using_mock:
            await self._mock_fallback.play()
            return
        if self._session is not None:
            await self._session.play()

    async def pause(self) -> None:
        if self._using_mock:
            await self._mock_fallback.pause()
            return
        if self._session is not None:
            await self._session.pause()

    async def stop(self) -> None:
        if self._using_mock:
            await self._mock_fallback.stop()
            return
        if self._session is not None:
            await self._session.stop()

    async def reset_context(self) -> None:
        if self._using_mock:
            await self._mock_fallback.reset_context()
            return
        if self._session is not None:
            await self._session.reset_context()

    async def _start_real_session(self) -> None:
        try:
            from google import genai
            from google.genai import types
        except Exception as exc:
            raise RuntimeError("google-genai package is not available") from exc

        self._genai_module = genai
        self._types_module = types

        self._client = genai.Client(api_key=self._api_key, http_options={"api_version": "v1alpha"})
        self._session_ctx = self._client.aio.live.music.connect(model=self._model)
        self._session = await self._session_ctx.__aenter__()
        self._recv_task = asyncio.create_task(self._receive_loop(), name="google-lyria-receive")

        # Apply latest known room state if available.
        if self._latest_state is not None:
            await self._apply_prompts(self._latest_state)
            await self._apply_config(self._latest_state)
            if self._latest_state.playback_state == PlaybackState.playing:
                await self._session.play()

    async def _apply_prompts(self, state: RoomState) -> None:
        if self._session is None or self._types_module is None:
            return

        weighted_prompts = [
            self._types_module.WeightedPrompt(text=prompt.text, weight=prompt.weight)
            for prompt in state.prompts
        ]

        if not weighted_prompts:
            # Keep session steerable even with empty UI prompt list.
            weighted_prompts = [self._types_module.WeightedPrompt(text="minimal techno", weight=1.0)]

        await self._session.set_weighted_prompts(prompts=weighted_prompts)

    async def _apply_config(self, state: RoomState) -> None:
        if self._session is None or self._types_module is None:
            return

        cfg = state.music_config
        scale_enum = getattr(self._types_module.Scale, cfg.scale.value, None)
        mode_enum = getattr(self._types_module.MusicGenerationMode, cfg.music_generation_mode.value, None)

        payload_kwargs = {
            "guidance": cfg.guidance,
            "bpm": cfg.bpm,
            "density": cfg.density,
            "brightness": cfg.brightness,
            "mute_bass": cfg.mute_bass,
            "mute_drums": cfg.mute_drums,
            "only_bass_and_drums": cfg.only_bass_and_drums,
            "temperature": cfg.temperature,
            "top_k": cfg.top_k,
            "audio_format": "pcm16",
            "sample_rate_hz": 48_000,
        }
        if cfg.seed is not None:
            payload_kwargs["seed"] = cfg.seed
        if scale_enum is not None:
            payload_kwargs["scale"] = scale_enum
        if mode_enum is not None:
            payload_kwargs["music_generation_mode"] = mode_enum

        live_cfg = self._types_module.LiveMusicGenerationConfig(**payload_kwargs)
        await self._session.set_music_generation_config(config=live_cfg)

    async def _receive_loop(self) -> None:
        if self._session is None:
            return

        while self._running or not self._using_mock:
            try:
                async for message in self._session.receive():
                    server_content = getattr(message, "server_content", None)
                    if not server_content:
                        continue
                    chunks = getattr(server_content, "audio_chunks", None) or []
                    for chunk in chunks:
                        data = getattr(chunk, "data", None)
                        if not data:
                            continue
                        await self._on_audio_chunk(data)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in Gemini receive loop; retrying in 250ms")
                await asyncio.sleep(0.25)


def create_lyria_session(
    *,
    on_audio_chunk: AudioChunkCallback,
    use_mock: bool,
    gemini_api_key: str | None,
    gemini_model: str,
) -> LyriaSession:
    if use_mock or not gemini_api_key:
        return MockLyriaSession(on_audio_chunk)
    return GoogleLyriaSession(on_audio_chunk=on_audio_chunk, api_key=gemini_api_key, model=gemini_model)
