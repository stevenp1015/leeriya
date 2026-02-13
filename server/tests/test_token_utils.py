from app.token_utils import create_token, verify_token


def test_create_and_verify_token_round_trip() -> None:
    token = create_token({"room_id": "room-1", "role": "A"}, secret="abc", ttl_seconds=60)
    payload = verify_token(token, secret="abc")

    assert payload["room_id"] == "room-1"
    assert payload["role"] == "A"
    assert "exp" in payload
    assert "iat" in payload


def test_verify_token_rejects_bad_signature() -> None:
    token = create_token({"room_id": "room-1", "role": "A"}, secret="abc", ttl_seconds=60)

    try:
        verify_token(token, secret="wrong")
    except ValueError as exc:
        assert "signature" in str(exc).lower()
    else:
        raise AssertionError("Expected ValueError for invalid signature")
