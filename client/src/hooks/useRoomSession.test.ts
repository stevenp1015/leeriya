import { describe, expect, it } from "vitest";

import { getActiveRoleForControl, isPlaying, patchFromBpm } from "./useRoomSession";
import type { RoomState } from "../lib/types";

const roomState: RoomState = {
  room_id: "room-1",
  prompts: [],
  playback_state: "paused",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  music_config: {
    guidance: 4,
    bpm: 130,
    density: 0.5,
    brightness: 0.5,
    scale: "SCALE_UNSPECIFIED",
    mute_bass: false,
    mute_drums: false,
    only_bass_and_drums: false,
    music_generation_mode: "QUALITY",
    temperature: 1.1,
    top_k: 40,
    seed: null,
  },
  participants: {
    A: { role: "A", color: "#2f7bff", connected: true, active_control: "bpm" },
    B: { role: "B", color: "#ff4a4a", connected: true, active_control: null },
  },
};

describe("useRoomSession helpers", () => {
  it("finds active role by control id", () => {
    expect(getActiveRoleForControl(roomState, "bpm")).toBe("A");
    expect(getActiveRoleForControl(roomState, "density")).toBeNull();
  });

  it("reports playback state", () => {
    expect(isPlaying("playing")).toBe(true);
    expect(isPlaying("paused")).toBe(false);
  });

  it("builds bpm patch", () => {
    expect(patchFromBpm(140)).toEqual({ bpm: 140 });
  });
});
