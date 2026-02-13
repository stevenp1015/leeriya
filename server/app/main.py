from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.models import EventEnvelope, RoomCreateResponse, RoomJoinRequest, RoomJoinResponse
from app.room_manager import Room, RoomCapacityError, RoomManager, RoomNotFoundError
from app.token_utils import create_token, verify_token

logger = logging.getLogger(__name__)

settings = get_settings()


async def _idle_room_reaper(manager: RoomManager, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        await manager.close_idle_rooms()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=20)
        except TimeoutError:
            continue


@asynccontextmanager
async def lifespan(_: FastAPI):
    manager = RoomManager(settings)
    app.state.room_manager = manager
    stop_event = asyncio.Event()
    reaper = asyncio.create_task(_idle_room_reaper(manager, stop_event), name="room-idle-reaper")
    yield
    stop_event.set()
    await reaper
    await manager.close_all()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/rooms", response_model=RoomCreateResponse)
async def create_room(request: Request) -> RoomCreateResponse:
    manager: RoomManager = request.app.state.room_manager
    room = await manager.create_room()
    join_url = str(request.base_url).rstrip("/") + f"/?room={room.room_id}"
    return RoomCreateResponse(room_id=room.room_id, join_url=join_url)


@app.post("/api/rooms/{room_id}/join", response_model=RoomJoinResponse)
async def join_room(room_id: str, body: RoomJoinRequest, request: Request) -> RoomJoinResponse:
    manager: RoomManager = request.app.state.room_manager

    try:
        room = await manager.get_room(room_id)
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found") from exc

    try:
        role = await room.reserve_role(body.preferred_role)
    except RoomCapacityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    token = create_token(
        {"room_id": room_id, "role": role},
        secret=settings.token_secret,
        ttl_seconds=settings.token_ttl_seconds,
    )
    return RoomJoinResponse(room_id=room_id, role=role, token=token)


@app.get("/api/rooms/{room_id}/state")
async def get_room_state(room_id: str, request: Request) -> dict[str, Any]:
    manager: RoomManager = request.app.state.room_manager
    try:
        room = await manager.get_room(room_id)
    except RoomNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found") from exc
    return await room.snapshot()


def _normalize_config_patch(raw_patch: dict[str, Any]) -> dict[str, Any]:
    key_map = {
        "musicGenerationMode": "music_generation_mode",
        "muteBass": "mute_bass",
        "muteDrums": "mute_drums",
        "onlyBassAndDrums": "only_bass_and_drums",
        "topK": "top_k",
    }

    patch: dict[str, Any] = {}
    for key, value in raw_patch.items():
        normalized_key = key_map.get(key, key)
        patch[normalized_key] = value
    return patch


def _extract_ws_token(websocket: WebSocket) -> str:
    token = websocket.query_params.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return token


def _authorize_token(token: str, room_id: str) -> Literal["A", "B"]:
    try:
        payload = verify_token(token, secret=settings.token_secret)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    token_room_id = payload.get("room_id")
    role = payload.get("role")

    if token_room_id != room_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token room mismatch")
    if role not in {"A", "B"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid role in token")

    return role


async def _get_room_or_close(websocket: WebSocket, room_id: str) -> Room:
    manager: RoomManager = websocket.app.state.room_manager
    try:
        return await manager.get_room(room_id)
    except RoomNotFoundError:
        await websocket.close(code=4404, reason="Room not found")
        raise


async def _broadcast_after_change(room: Room) -> None:
    await room.broadcast_state()


async def _handle_control_event(room: Room, role: Literal["A", "B"], event: dict[str, Any]) -> None:
    event_type = event.get("type")
    payload = event.get("payload", {}) or {}

    if event_type == "control.patch":
        patch = _normalize_config_patch(payload.get("patch", {}))
        _, requires_reset = await room.apply_music_config_patch(patch)
        if requires_reset:
            await room.handle_playback_command("reset_context")
        await _broadcast_after_change(room)
        return

    if event_type == "prompt.add":
        text = str(payload.get("text", "")).strip()
        if not text:
            raise ValueError("Prompt text is required")
        weight = float(payload.get("weight", 1.0))
        await room.add_prompt(role=role, text=text, weight=weight)
        await _broadcast_after_change(room)
        return

    if event_type == "prompt.update_weight":
        prompt_id = str(payload.get("promptId", "")).strip()
        weight = float(payload.get("weight", 1.0))
        await room.update_prompt_weight(prompt_id=prompt_id, weight=weight)
        await _broadcast_after_change(room)
        return

    if event_type == "prompt.remove":
        prompt_id = str(payload.get("promptId", "")).strip()
        await room.remove_prompt(prompt_id=prompt_id)
        await _broadcast_after_change(room)
        return

    if event_type == "playback.command":
        command = str(payload.get("command", "")).strip()
        await room.handle_playback_command(command)
        await _broadcast_after_change(room)
        return

    if event_type == "control.interaction":
        active = bool(payload.get("active", False))
        control_id = str(payload.get("controlId", "")).strip() or None
        await room.set_active_control(role=role, control_id=control_id if active else None)
        await _broadcast_after_change(room)
        return

    if event_type == "ping":
        # Ignore; socket transport-level ping/pong also works.
        return

    raise ValueError(f"Unsupported event type: {event_type}")


@app.websocket("/ws/rooms/{room_id}/control")
async def room_control_ws(websocket: WebSocket, room_id: str) -> None:
    await websocket.accept()

    manager: RoomManager = websocket.app.state.room_manager

    try:
        token = _extract_ws_token(websocket)
        role = _authorize_token(token, room_id)
        room = await _get_room_or_close(websocket, room_id)

        await room.ensure_session()
        await room.register_control_socket(websocket, role)
        await room.broadcast_state()

        while True:
            message = await websocket.receive_json()
            try:
                await _handle_control_event(room, role, message)
            except Exception as exc:
                await websocket.send_json(
                    EventEnvelope(type="server.error", payload={"message": str(exc)}).model_dump(mode="json")
                )

    except WebSocketDisconnect:
        pass
    except RoomNotFoundError:
        pass
    except HTTPException as exc:
        await websocket.send_json(EventEnvelope(type="server.error", payload={"message": exc.detail}).model_dump(mode="json"))
    finally:
        try:
            room = await manager.get_room(room_id)
            await room.unregister_control_socket(websocket)
            await room.broadcast_state()
            await manager.close_room_if_idle(room_id)
        except RoomNotFoundError:
            return
        except Exception:
            logger.exception("Failed to finalize control websocket cleanup")


@app.websocket("/ws/rooms/{room_id}/audio")
async def room_audio_ws(websocket: WebSocket, room_id: str) -> None:
    await websocket.accept()
    manager: RoomManager = websocket.app.state.room_manager

    try:
        token = _extract_ws_token(websocket)
        _authorize_token(token, room_id)
        room = await _get_room_or_close(websocket, room_id)

        await room.ensure_session()
        await room.register_audio_socket(websocket)
        await room.send_audio_format(websocket)

        while True:
            await websocket.receive()

    except WebSocketDisconnect:
        pass
    except RoomNotFoundError:
        pass
    except HTTPException as exc:
        try:
            await websocket.send_json(
                EventEnvelope(type="server.error", payload={"message": exc.detail}).model_dump(mode="json")
            )
        except Exception:
            pass
    finally:
        try:
            room = await manager.get_room(room_id)
            await room.unregister_audio_socket(websocket)
            await manager.close_room_if_idle(room_id)
        except RoomNotFoundError:
            return
        except Exception:
            logger.exception("Failed to finalize audio websocket cleanup")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
