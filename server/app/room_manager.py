from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import WebSocket

from app.config import Settings
from app.lyria import LyriaSession, create_lyria_session
from app.models import (
    EventEnvelope,
    MusicConfig,
    ParticipantState,
    PlaybackState,
    ROLE_COLORS,
    RoomState,
    WeightedPrompt,
)

logger = logging.getLogger(__name__)

Role = Literal["A", "B"]


class RoomCapacityError(RuntimeError):
    pass


class RoomNotFoundError(RuntimeError):
    pass


class Room:
    def __init__(self, *, room_id: str, settings: Settings) -> None:
        participants = {
            "A": ParticipantState(role="A", color=ROLE_COLORS["A"], connected=False),
            "B": ParticipantState(role="B", color=ROLE_COLORS["B"], connected=False),
        }
        self.room_id = room_id
        self.state = RoomState(room_id=room_id, participants=participants)
        self.settings = settings

        self._control_sockets: dict[WebSocket, Role] = {}
        self._audio_sockets: set[WebSocket] = set()
        self._reservations: dict[Role, float] = {}
        self._lock = asyncio.Lock()

        self._lyria: LyriaSession = create_lyria_session(
            on_audio_chunk=self.broadcast_audio,
            use_mock=settings.use_mock_lyria,
            gemini_api_key=settings.gemini_api_key,
            gemini_model=settings.gemini_model,
        )
        self._lyria_started = False

    @property
    def active_roles(self) -> set[Role]:
        return set(self._control_sockets.values())

    async def ensure_session(self) -> None:
        if self._lyria_started:
            return
        await self._lyria.start()
        await self._lyria.apply_state(self.state)
        self._lyria_started = True

    async def close(self) -> None:
        await self._lyria.close()

    async def reserve_role(self, preferred: Role | None = None) -> Role:
        async with self._lock:
            now = time.time()
            self._reservations = {r: exp for r, exp in self._reservations.items() if exp > now}
            unavailable = set(self.active_roles) | {r for r, _ in self._reservations.items()}

            order: list[Role] = ["A", "B"]
            if preferred and preferred in order:
                order = [preferred] + [x for x in order if x != preferred]

            for role in order:
                if role not in unavailable:
                    self._reservations[role] = now + self.settings.reservation_ttl_seconds
                    return role

            raise RoomCapacityError("Room already has two active participants")

    async def register_control_socket(self, websocket: WebSocket, role: Role) -> None:
        async with self._lock:
            self._control_sockets[websocket] = role
            self._reservations.pop(role, None)
            self.state.participants[role].connected = True
            self.state.participants[role].active_control = None
            self._touch_locked()

    async def unregister_control_socket(self, websocket: WebSocket) -> None:
        async with self._lock:
            role = self._control_sockets.pop(websocket, None)
            if role is None:
                return
            self.state.participants[role].connected = False
            self.state.participants[role].active_control = None
            self._touch_locked()

    async def register_audio_socket(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._audio_sockets.add(websocket)

    async def unregister_audio_socket(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._audio_sockets.discard(websocket)

    async def snapshot(self) -> dict:
        async with self._lock:
            return self.state.model_dump(mode="json")

    async def set_active_control(self, *, role: Role, control_id: Optional[str]) -> None:
        async with self._lock:
            participant = self.state.participants[role]
            participant.active_control = control_id
            self._touch_locked()

    async def add_prompt(self, *, role: Role, text: str, weight: float = 1.0) -> dict:
        async with self._lock:
            prompt = WeightedPrompt(text=text, weight=weight, created_by=role)
            self.state.prompts.append(prompt)
            self._touch_locked()
            snapshot = self.state.model_dump(mode="json")
        await self._lyria.apply_state(self.state)
        return snapshot

    async def update_prompt_weight(self, *, prompt_id: str, weight: float) -> dict:
        async with self._lock:
            found = False
            for prompt in self.state.prompts:
                if prompt.id == prompt_id:
                    prompt.weight = weight
                    found = True
                    break
            if not found:
                raise ValueError("Prompt not found")
            self._touch_locked()
            snapshot = self.state.model_dump(mode="json")
        await self._lyria.apply_state(self.state)
        return snapshot

    async def remove_prompt(self, *, prompt_id: str) -> dict:
        async with self._lock:
            original_len = len(self.state.prompts)
            self.state.prompts = [prompt for prompt in self.state.prompts if prompt.id != prompt_id]
            if len(self.state.prompts) == original_len:
                raise ValueError("Prompt not found")
            self._touch_locked()
            snapshot = self.state.model_dump(mode="json")
        await self._lyria.apply_state(self.state)
        return snapshot

    async def apply_music_config_patch(self, patch: dict) -> tuple[dict, bool]:
        async with self._lock:
            existing = self.state.music_config.model_dump()
            changed_keys = {key for key, value in patch.items() if existing.get(key) != value}
            merged = {**existing, **patch}
            self.state.music_config = MusicConfig.model_validate(merged)
            self._touch_locked()
            snapshot = self.state.model_dump(mode="json")

        await self._lyria.apply_state(self.state)
        requires_reset = bool(changed_keys & {"bpm", "scale"})
        return snapshot, requires_reset

    async def handle_playback_command(self, command: str) -> dict:
        command = command.lower()
        if command not in {"play", "pause", "stop", "reset_context"}:
            raise ValueError("Unsupported playback command")

        async with self._lock:
            if command == "play":
                self.state.playback_state = PlaybackState.playing
            elif command == "pause":
                self.state.playback_state = PlaybackState.paused
            elif command == "stop":
                self.state.playback_state = PlaybackState.stopped
            self._touch_locked()
            snapshot = self.state.model_dump(mode="json")

        if command == "play":
            await self._lyria.play()
        elif command == "pause":
            await self._lyria.pause()
        elif command == "stop":
            await self._lyria.stop()
        elif command == "reset_context":
            await self._lyria.reset_context()

        await self._lyria.apply_state(self.state)
        return snapshot

    async def control_client_count(self) -> int:
        async with self._lock:
            return len(self._control_sockets)

    async def is_idle(self) -> bool:
        async with self._lock:
            no_clients = not self._control_sockets and not self._audio_sockets
            idle_seconds = (datetime.now(timezone.utc) - self.state.updated_at).total_seconds()
            return no_clients and idle_seconds >= self.settings.room_idle_timeout_seconds

    async def broadcast_state(self) -> None:
        payload = EventEnvelope(type="server.state_snapshot", payload=await self.snapshot()).model_dump(mode="json")
        await self._broadcast_control_payload(payload)

    async def broadcast_error(self, *, message: str) -> None:
        payload = EventEnvelope(type="server.error", payload={"message": message}).model_dump(mode="json")
        await self._broadcast_control_payload(payload)

    async def send_audio_format(self, websocket: WebSocket) -> None:
        await websocket.send_json(
            EventEnvelope(
                type="server.audio_format",
                payload={"sampleRateHz": 48_000, "channels": 2, "encoding": "pcm16"},
            ).model_dump(mode="json")
        )

    async def broadcast_audio(self, chunk: bytes) -> None:
        async with self._lock:
            clients = list(self._audio_sockets)

        if not clients:
            return

        stale: list[WebSocket] = []
        send_tasks = []
        for ws in clients:
            send_tasks.append(self._safe_send_bytes(ws, chunk, stale))

        if send_tasks:
            await asyncio.gather(*send_tasks)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._audio_sockets.discard(ws)

    async def _safe_send_bytes(self, websocket: WebSocket, chunk: bytes, stale: list[WebSocket]) -> None:
        try:
            await websocket.send_bytes(chunk)
        except Exception:
            stale.append(websocket)

    async def _broadcast_control_payload(self, payload: dict) -> None:
        async with self._lock:
            clients = list(self._control_sockets.keys())

        if not clients:
            return

        stale: list[WebSocket] = []

        async def _send(ws: WebSocket) -> None:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)

        await asyncio.gather(*[_send(ws) for ws in clients])

        if stale:
            async with self._lock:
                for ws in stale:
                    role = self._control_sockets.pop(ws, None)
                    if role:
                        self.state.participants[role].connected = False
                        self.state.participants[role].active_control = None
                if stale:
                    self._touch_locked()

    def _touch_locked(self) -> None:
        self.state.updated_at = datetime.now(timezone.utc)


class RoomManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def create_room(self) -> Room:
        room_id = str(uuid4())
        room = Room(room_id=room_id, settings=self._settings)
        async with self._lock:
            self._rooms[room_id] = room
        return room

    async def get_room(self, room_id: str) -> Room:
        async with self._lock:
            room = self._rooms.get(room_id)
        if room is None:
            raise RoomNotFoundError(room_id)
        return room

    async def close_room_if_idle(self, room_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(room_id)
        if not room:
            return

        if await room.is_idle():
            await room.close()
            async with self._lock:
                self._rooms.pop(room_id, None)
            logger.info("Closed idle room %s", room_id)

    async def list_room_ids(self) -> list[str]:
        async with self._lock:
            return list(self._rooms.keys())

    async def close_idle_rooms(self) -> None:
        for room_id in await self.list_room_ids():
            await self.close_room_if_idle(room_id)

    async def close_all(self) -> None:
        async with self._lock:
            rooms = list(self._rooms.values())
            self._rooms.clear()
        await asyncio.gather(*[room.close() for room in rooms], return_exceptions=True)
