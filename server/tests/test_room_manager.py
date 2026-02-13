import pytest

from app.config import Settings
from app.room_manager import RoomCapacityError, RoomManager


@pytest.mark.asyncio
async def test_room_role_reservations_fill_two_slots() -> None:
    settings = Settings(token_secret="test", use_mock_lyria=True)
    manager = RoomManager(settings)
    room = await manager.create_room()

    first = await room.reserve_role()
    second = await room.reserve_role()

    assert {first, second} == {"A", "B"}

    with pytest.raises(RoomCapacityError):
        await room.reserve_role()


@pytest.mark.asyncio
async def test_prompt_mutation_and_config_patch() -> None:
    settings = Settings(token_secret="test", use_mock_lyria=True)
    manager = RoomManager(settings)
    room = await manager.create_room()

    await room.ensure_session()

    snapshot = await room.add_prompt(role="A", text="Minimal techno", weight=1.0)
    assert len(snapshot["prompts"]) == 1

    prompt_id = snapshot["prompts"][0]["id"]
    snapshot = await room.update_prompt_weight(prompt_id=prompt_id, weight=2.5)
    assert snapshot["prompts"][0]["weight"] == 2.5

    snapshot, needs_reset = await room.apply_music_config_patch({"bpm": 140})
    assert snapshot["music_config"]["bpm"] == 140
    assert needs_reset is True

    snapshot = await room.remove_prompt(prompt_id=prompt_id)
    assert snapshot["prompts"] == []

    await manager.close_all()
