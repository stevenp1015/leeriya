import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PcmAudioEngine } from "../audio/PcmAudioEngine";
import { buildWsUrl, createRoom, fetchRoomState, joinRoom } from "../lib/api";
import type {
  MusicConfig,
  PlaybackState,
  Role,
  RoomState,
  ScaleEnum,
  ServerEnvelope,
} from "../lib/types";

interface UseRoomSessionResult {
  getFrequencyData: (target: Uint8Array) => void;
  roomId: string | null;
  shareUrl: string | null;
  role: Role | null;
  roomState: RoomState | null;
  connected: boolean;
  joined: boolean;
  error: string | null;
  audioQueueDepth: number;
  joinAndConnect: () => Promise<void>;
  sendMusicPatch: (patch: Partial<MusicConfig>) => void;
  addPrompt: (text: string, weight?: number) => void;
  updatePromptWeight: (promptId: string, weight: number) => void;
  removePrompt: (promptId: string) => void;
  sendPlayback: (command: "play" | "pause" | "stop" | "reset_context") => void;
  setInteraction: (controlId: string, active: boolean) => void;
}

function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("room");
}

function updateUrlRoom(roomId: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set("room", roomId);
  window.history.replaceState(null, "", `/?${params.toString()}`);
}

export function useRoomSession(): UseRoomSessionResult {
  const [roomId, setRoomId] = useState<string | null>(getRoomFromUrl());
  const [shareUrl, setShareUrl] = useState<string | null>(
    roomId ? `${window.location.origin}/?room=${roomId}` : null
  );
  const [role, setRole] = useState<Role | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioQueueDepth, setAudioQueueDepth] = useState(0);

  const audioEngineRef = useRef(new PcmAudioEngine());
  const controlSocketRef = useRef<WebSocket | null>(null);
  const audioSocketRef = useRef<WebSocket | null>(null);

  const ensureRoom = useCallback(async (): Promise<string> => {
    if (roomId) {
      return roomId;
    }

    const created = await createRoom();
    updateUrlRoom(created.room_id);
    setRoomId(created.room_id);
    setShareUrl(`${window.location.origin}/?room=${created.room_id}`);
    return created.room_id;
  }, [roomId]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const resolvedRoomId = await ensureRoom();
        const snapshot = await fetchRoomState(resolvedRoomId);
        if (active) {
          setRoomState(snapshot);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to bootstrap room");
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [ensureRoom]);

  const sendEvent = useCallback((event: ServerEnvelope) => {
    const ws = controlSocketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(event));
  }, []);

  const joinAndConnect = useCallback(async () => {
    if (joined && connected) {
      return;
    }

    setError(null);
    try {
      controlSocketRef.current?.close();
      audioSocketRef.current?.close();

      const resolvedRoomId = await ensureRoom();
      await audioEngineRef.current.initFromUserGesture();

      const join = await joinRoom(resolvedRoomId);
      setRole(join.role);

      const controlWs = new WebSocket(
        buildWsUrl(`/ws/rooms/${encodeURIComponent(resolvedRoomId)}/control?token=${encodeURIComponent(join.token)}`)
      );

      controlWs.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data) as ServerEnvelope;

          if (envelope.type === "server.state_snapshot") {
            setRoomState(envelope.payload as RoomState);
          } else if (envelope.type === "server.error") {
            const payload = envelope.payload as { message?: string };
            setError(payload.message ?? "Server error");
          }
        } catch {
          setError("Failed to parse server message");
        }
      };

      controlWs.onopen = () => {
        setConnected(true);
        setJoined(true);
      };

      controlWs.onclose = () => {
        setConnected(false);
        setJoined(false);
      };

      controlSocketRef.current = controlWs;

      const audioWs = new WebSocket(
        buildWsUrl(`/ws/rooms/${encodeURIComponent(resolvedRoomId)}/audio?token=${encodeURIComponent(join.token)}`)
      );
      audioWs.binaryType = "arraybuffer";

      audioWs.onmessage = (event) => {
        if (typeof event.data === "string") {
          return;
        }
        audioEngineRef.current.enqueuePcm16(event.data as ArrayBuffer);
        setAudioQueueDepth(audioEngineRef.current.getQueueDepth());
      };

      audioSocketRef.current = audioWs;
    } catch (err) {
      setConnected(false);
      setJoined(false);
      setError(err instanceof Error ? err.message : "Failed to join room");
    }
  }, [connected, ensureRoom, joined]);

  const sendMusicPatch = useCallback(
    (patch: Partial<MusicConfig>) => {
      sendEvent({ type: "control.patch", payload: { patch } });
    },
    [sendEvent]
  );

  const addPrompt = useCallback(
    (text: string, weight = 1.0) => {
      sendEvent({ type: "prompt.add", payload: { text, weight } });
    },
    [sendEvent]
  );

  const updatePromptWeight = useCallback(
    (promptId: string, weight: number) => {
      sendEvent({ type: "prompt.update_weight", payload: { promptId, weight } });
    },
    [sendEvent]
  );

  const removePrompt = useCallback(
    (promptId: string) => {
      sendEvent({ type: "prompt.remove", payload: { promptId } });
    },
    [sendEvent]
  );

  const sendPlayback = useCallback(
    (command: "play" | "pause" | "stop" | "reset_context") => {
      sendEvent({ type: "playback.command", payload: { command } });
    },
    [sendEvent]
  );

  const setInteraction = useCallback(
    (controlId: string, active: boolean) => {
      sendEvent({ type: "control.interaction", payload: { controlId, active } });
    },
    [sendEvent]
  );

  const getFrequencyData = useCallback((target: Uint8Array) => {
    audioEngineRef.current.getFrequencyData(target);
  }, []);

  useEffect(() => {
    return () => {
      controlSocketRef.current?.close();
      audioSocketRef.current?.close();
      void audioEngineRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    setShareUrl(`${window.location.origin}/?room=${roomId}`);
  }, [roomId]);

  return useMemo(
    () => ({
      roomId,
      shareUrl,
      role,
      roomState,
      connected,
      joined,
      error,
      audioQueueDepth,
      getFrequencyData,
      joinAndConnect,
      sendMusicPatch,
      addPrompt,
      updatePromptWeight,
      removePrompt,
      sendPlayback,
      setInteraction,
    }),
    [
      roomId,
      shareUrl,
      role,
      roomState,
      connected,
      joined,
      error,
      audioQueueDepth,
      getFrequencyData,
      joinAndConnect,
      sendMusicPatch,
      addPrompt,
      updatePromptWeight,
      removePrompt,
      sendPlayback,
      setInteraction,
    ]
  );
}

export function getActiveRoleForControl(roomState: RoomState | null, controlId: string): Role | null {
  if (!roomState) {
    return null;
  }

  const entries = Object.values(roomState.participants);
  const match = entries.find((participant) => participant.active_control === controlId);
  return match?.role ?? null;
}

export function patchFromBpm(value: number): Partial<MusicConfig> {
  return { bpm: value };
}

export function isPlaying(playbackState: PlaybackState): boolean {
  return playbackState === "playing";
}

export function coerceScale(value: string): ScaleEnum {
  return value as ScaleEnum;
}
