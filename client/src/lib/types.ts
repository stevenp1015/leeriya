export type Role = "A" | "B";

export type PlaybackState = "paused" | "playing" | "stopped";

export type MusicGenerationMode = "QUALITY" | "DIVERSITY" | "VOCALIZATION";

export type ScaleEnum =
  | "C_MAJOR_A_MINOR"
  | "D_FLAT_MAJOR_B_FLAT_MINOR"
  | "D_MAJOR_B_MINOR"
  | "E_FLAT_MAJOR_C_MINOR"
  | "E_MAJOR_D_FLAT_MINOR"
  | "F_MAJOR_D_MINOR"
  | "G_FLAT_MAJOR_E_FLAT_MINOR"
  | "G_MAJOR_E_MINOR"
  | "A_FLAT_MAJOR_F_MINOR"
  | "A_MAJOR_G_FLAT_MINOR"
  | "B_FLAT_MAJOR_G_MINOR"
  | "B_MAJOR_A_FLAT_MINOR"
  | "SCALE_UNSPECIFIED";

export interface WeightedPrompt {
  id: string;
  text: string;
  weight: number;
  created_by: Role;
}

export interface MusicConfig {
  guidance: number;
  bpm: number;
  density: number;
  brightness: number;
  scale: ScaleEnum;
  mute_bass: boolean;
  mute_drums: boolean;
  only_bass_and_drums: boolean;
  music_generation_mode: MusicGenerationMode;
  temperature: number;
  top_k: number;
  seed: number | null;
}

export interface ParticipantState {
  role: Role;
  color: string;
  connected: boolean;
  active_control: string | null;
}

export interface RoomState {
  room_id: string;
  prompts: WeightedPrompt[];
  music_config: MusicConfig;
  participants: Record<Role, ParticipantState>;
  playback_state: PlaybackState;
  created_at: string;
  updated_at: string;
}

export interface ServerEnvelope<T = unknown> {
  type: string;
  payload: T;
}

export interface JoinResponse {
  room_id: string;
  role: Role;
  token: string;
}

export interface RoomCreateResponse {
  room_id: string;
  join_url: string;
}
