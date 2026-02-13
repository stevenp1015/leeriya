import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "./components/BottomSheet";
import { PromptFaders } from "./components/PromptFaders";
import { TopBar } from "./components/TopBar";
import { getActiveRoleForControl, isPlaying, useRoomSession } from "./hooks/useRoomSession";
import type { MusicConfig, Role } from "./lib/types";
import { LiquidBlob } from "./visualizer/LiquidBlob";

const defaultConfig: MusicConfig = {
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
};

const fallbackRoleColors: Record<Role, string> = {
  A: "#2f7bff",
  B: "#ff4a4a",
};

export function App() {
  const {
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
  } = useRoomSession();

  const [sheetFullOpen, setSheetFullOpen] = useState(false);
  const [bpmLocal, setBpmLocal] = useState(130);

  const bpmDebounceRef = useRef<number | null>(null);

  const config = roomState?.music_config ?? defaultConfig;
  const playbackState = roomState?.playback_state ?? "paused";

  useEffect(() => {
    setBpmLocal(config.bpm);
  }, [config.bpm]);

  useEffect(() => {
    return () => {
      if (bpmDebounceRef.current !== null) {
        window.clearTimeout(bpmDebounceRef.current);
      }
    };
  }, []);

  const roleColors = useMemo<Record<Role, string>>(() => {
    if (!roomState?.participants) {
      return fallbackRoleColors;
    }

    return {
      A: roomState.participants.A?.color ?? fallbackRoleColors.A,
      B: roomState.participants.B?.color ?? fallbackRoleColors.B,
    };
  }, [roomState]);

  const activeRoleByControl = useCallback(
    (controlId: string) => getActiveRoleForControl(roomState, controlId),
    [roomState]
  );

  const updateBpmDebounced = useCallback(
    (value: number) => {
      setBpmLocal(value);
      if (bpmDebounceRef.current !== null) {
        window.clearTimeout(bpmDebounceRef.current);
      }
      bpmDebounceRef.current = window.setTimeout(() => {
        sendMusicPatch({ bpm: value });
      }, 90);
    },
    [sendMusicPatch]
  );

  const onJoin = useCallback(() => {
    void joinAndConnect();
  }, [joinAndConnect]);

  return (
    <div className="app-shell">
      <div className="atmosphere atmosphere-a" />
      <div className="atmosphere atmosphere-b" />

      <LiquidBlob getFrequencyData={getFrequencyData} />

      <TopBar
        joined={joined}
        connected={connected}
        playbackState={playbackState}
        roleColors={roleColors}
        activeRoleByControl={activeRoleByControl}
        onJoin={onJoin}
        onTogglePlayback={() => {
          setInteraction("playback", true);
          sendPlayback(isPlaying(playbackState) ? "pause" : "play");
          window.setTimeout(() => setInteraction("playback", false), 120);
        }}
        bpm={bpmLocal}
        onBpmChange={updateBpmDebounced}
        onBpmInteraction={(active) => setInteraction("bpm", active)}
        scale={config.scale}
        onScaleChange={(value) => sendMusicPatch({ scale: value })}
        onScaleInteraction={(active) => setInteraction("scale", active)}
        shareUrl={shareUrl}
      />

      <section className="main-overlay">
        <div className="status-strip">
          <span className="status-pill">room: {roomId?.slice(0, 8) ?? "..."}</span>
          <span className="status-pill">role: {role ?? "pending"}</span>
          <span className="status-pill">queue: {audioQueueDepth}</span>
        </div>

        <PromptFaders
          prompts={roomState?.prompts ?? []}
          activeRoleByControl={activeRoleByControl}
          roleColors={roleColors}
          onWeightChange={updatePromptWeight}
          onRemove={removePrompt}
          onInteraction={setInteraction}
        />
      </section>

      <BottomSheet
        fullOpen={sheetFullOpen}
        setFullOpen={setSheetFullOpen}
        joined={joined}
        musicConfig={config}
        roleColors={roleColors}
        activeRoleByControl={activeRoleByControl}
        onPatch={sendMusicPatch}
        onPromptAdd={addPrompt}
        onInteraction={setInteraction}
        onPlayback={sendPlayback}
      />

      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}
