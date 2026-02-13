from fastapi.testclient import TestClient

from app.main import app


def test_create_room_and_join() -> None:
    with TestClient(app) as client:
        create = client.post("/api/rooms")
        assert create.status_code == 200
        room_id = create.json()["room_id"]

        join_a = client.post(f"/api/rooms/{room_id}/join", json={})
        join_b = client.post(f"/api/rooms/{room_id}/join", json={})

        assert join_a.status_code == 200
        assert join_b.status_code == 200
        assert join_a.json()["role"] != join_b.json()["role"]

        join_c = client.post(f"/api/rooms/{room_id}/join", json={})
        assert join_c.status_code == 409
