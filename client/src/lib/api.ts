import type { JoinResponse, RoomCreateResponse, RoomState, Role } from "./types";

export async function createRoom(): Promise<RoomCreateResponse> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  return response.json() as Promise<RoomCreateResponse>;
}

export async function joinRoom(roomId: string, preferredRole?: Role): Promise<JoinResponse> {
  const response = await fetch(`/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preferredRole ? { preferred_role: preferredRole } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to join room");
  }

  return response.json() as Promise<JoinResponse>;
}

export async function fetchRoomState(roomId: string): Promise<RoomState> {
  const response = await fetch(`/api/rooms/${roomId}/state`);
  if (!response.ok) {
    throw new Error("Failed to fetch room state");
  }
  return response.json() as Promise<RoomState>;
}

export function buildWsUrl(path: string): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${scheme}://${host}${path}`;
}
