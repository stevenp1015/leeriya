from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_token(payload: dict[str, Any], secret: str, ttl_seconds: int) -> str:
    token_payload = {
        **payload,
        "exp": int(time.time()) + ttl_seconds,
        "iat": int(time.time()),
    }
    payload_bytes = json.dumps(token_payload, separators=(",", ":")).encode("utf-8")
    payload_segment = _b64url_encode(payload_bytes)

    signature = hmac.new(secret.encode("utf-8"), payload_segment.encode("utf-8"), hashlib.sha256).digest()
    signature_segment = _b64url_encode(signature)
    return f"{payload_segment}.{signature_segment}"


def verify_token(token: str, secret: str) -> dict[str, Any]:
    try:
        payload_segment, signature_segment = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    expected_signature = hmac.new(
        secret.encode("utf-8"), payload_segment.encode("utf-8"), hashlib.sha256
    ).digest()
    actual_signature = _b64url_decode(signature_segment)

    if not hmac.compare_digest(expected_signature, actual_signature):
        raise ValueError("Invalid token signature")

    payload_raw = _b64url_decode(payload_segment)
    payload = json.loads(payload_raw.decode("utf-8"))

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")

    return payload
