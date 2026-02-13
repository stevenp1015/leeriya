from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


ROLE_COLORS = {
    "A": "#2f7bff",
    "B": "#ff4a4a",
}


class PlaybackState(str, Enum):
    paused = "paused"
    playing = "playing"
    stopped = "stopped"


class MusicGenerationMode(str, Enum):
    QUALITY = "QUALITY"
    DIVERSITY = "DIVERSITY"
    VOCALIZATION = "VOCALIZATION"


class ScaleEnum(str, Enum):
    C_MAJOR_A_MINOR = "C_MAJOR_A_MINOR"
    D_FLAT_MAJOR_B_FLAT_MINOR = "D_FLAT_MAJOR_B_FLAT_MINOR"
    D_MAJOR_B_MINOR = "D_MAJOR_B_MINOR"
    E_FLAT_MAJOR_C_MINOR = "E_FLAT_MAJOR_C_MINOR"
    E_MAJOR_D_FLAT_MINOR = "E_MAJOR_D_FLAT_MINOR"
    F_MAJOR_D_MINOR = "F_MAJOR_D_MINOR"
    G_FLAT_MAJOR_E_FLAT_MINOR = "G_FLAT_MAJOR_E_FLAT_MINOR"
    G_MAJOR_E_MINOR = "G_MAJOR_E_MINOR"
    A_FLAT_MAJOR_F_MINOR = "A_FLAT_MAJOR_F_MINOR"
    A_MAJOR_G_FLAT_MINOR = "A_MAJOR_G_FLAT_MINOR"
    B_FLAT_MAJOR_G_MINOR = "B_FLAT_MAJOR_G_MINOR"
    B_MAJOR_A_FLAT_MINOR = "B_MAJOR_A_FLAT_MINOR"
    SCALE_UNSPECIFIED = "SCALE_UNSPECIFIED"


class WeightedPrompt(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    text: str = Field(min_length=1, max_length=300)
    weight: float = Field(default=1.0, ge=-10.0, le=10.0)
    created_by: Literal["A", "B"]


class MusicConfig(BaseModel):
    guidance: float = Field(default=4.0, ge=0.0, le=6.0)
    bpm: int = Field(default=130, ge=60, le=200)
    density: float = Field(default=0.5, ge=0.0, le=1.0)
    brightness: float = Field(default=0.5, ge=0.0, le=1.0)
    scale: ScaleEnum = ScaleEnum.SCALE_UNSPECIFIED

    mute_bass: bool = False
    mute_drums: bool = False
    only_bass_and_drums: bool = False

    music_generation_mode: MusicGenerationMode = MusicGenerationMode.QUALITY
    temperature: float = Field(default=1.1, ge=0.0, le=3.0)
    top_k: int = Field(default=40, ge=1, le=1000)
    seed: Optional[int] = Field(default=None, ge=0, le=2_147_483_647)


class ParticipantState(BaseModel):
    role: Literal["A", "B"]
    color: str
    connected: bool = False
    active_control: Optional[str] = None


class RoomState(BaseModel):
    model_config = ConfigDict(use_enum_values=False)

    room_id: str
    prompts: list[WeightedPrompt] = Field(default_factory=list)
    music_config: MusicConfig = Field(default_factory=MusicConfig)
    participants: dict[Literal["A", "B"], ParticipantState] = Field(default_factory=dict)
    playback_state: PlaybackState = PlaybackState.paused
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("participants", mode="before")
    @classmethod
    def ensure_participants(cls, value: Any) -> Any:
        participants = value or {}
        for role in ["A", "B"]:
            if role not in participants:
                participants[role] = ParticipantState(role=role, color=ROLE_COLORS[role], connected=False)
        return participants


class RoomCreateResponse(BaseModel):
    room_id: str
    join_url: str


class RoomJoinRequest(BaseModel):
    preferred_role: Literal["A", "B"] | None = None


class RoomJoinResponse(BaseModel):
    room_id: str
    role: Literal["A", "B"]
    token: str


class EventEnvelope(BaseModel):
    type: str
    payload: dict[str, Any]
