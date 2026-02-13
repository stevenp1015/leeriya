import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { MusicConfig, Role } from "../lib/types";

interface BottomSheetProps {
  fullOpen: boolean;
  setFullOpen: (value: boolean) => void;
  joined: boolean;
  musicConfig: MusicConfig;
  roleColors: Record<Role, string>;
  activeRoleByControl: (controlId: string) => Role | null;
  onPatch: (patch: Partial<MusicConfig>) => void;
  onPromptAdd: (text: string) => void;
  onInteraction: (controlId: string, active: boolean) => void;
  onPlayback: (command: "stop" | "reset_context") => void;
}

function glowStyle(controlId: string, roleColors: Record<Role, string>, activeRoleByControl: (id: string) => Role | null) {
  const activeRole = activeRoleByControl(controlId);
  if (!activeRole) {
    return undefined;
  }

  return { boxShadow: `0 0 18px ${roleColors[activeRole]}` };
}

function SliderField({
  joined,
  label,
  value,
  min,
  max,
  step,
  controlId,
  onChange,
  onInteraction,
  style,
}: {
  joined: boolean;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  controlId: string;
  onChange: (value: number) => void;
  onInteraction: (controlId: string, active: boolean) => void;
  style?: CSSProperties;
}) {
  return (
    <label className="slider-field" style={style}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!joined}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={() => onInteraction(controlId, true)}
        onPointerUp={() => onInteraction(controlId, false)}
        onPointerCancel={() => onInteraction(controlId, false)}
      />
      <strong>{value.toFixed(step < 1 ? 2 : 0)}</strong>
    </label>
  );
}

export function BottomSheet({
  fullOpen,
  setFullOpen,
  joined,
  musicConfig,
  roleColors,
  activeRoleByControl,
  onPatch,
  onPromptAdd,
  onInteraction,
  onPlayback,
}: BottomSheetProps) {
  const [promptDraft, setPromptDraft] = useState("");
  const dragStartY = useRef<number | null>(null);

  const patchWithInteraction = (controlId: string, patch: Partial<MusicConfig>) => {
    onInteraction(controlId, true);
    onPatch(patch);
    window.setTimeout(() => onInteraction(controlId, false), 120);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (dragStartY.current === null) {
        return;
      }
      const deltaY = event.clientY - dragStartY.current;
      if (deltaY < -45) {
        setFullOpen(true);
        dragStartY.current = null;
      }
      if (deltaY > 45) {
        setFullOpen(false);
        dragStartY.current = null;
      }
    };

    const onPointerUp = () => {
      dragStartY.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [setFullOpen]);

  return (
    <>
      {fullOpen ? <button className="sheet-backdrop" onClick={() => setFullOpen(false)} aria-label="Close controls" /> : null}
      <section className={`bottom-sheet ${fullOpen ? "full" : "partial"}`}>
        <button
          className="sheet-handle"
          onPointerDown={(event) => {
            dragStartY.current = event.clientY;
          }}
          onClick={() => setFullOpen(!fullOpen)}
          aria-label="Toggle controls drawer"
        >
          <span />
        </button>

        <div className="sheet-top-tier">
          <form
            className="prompt-entry"
            onSubmit={(event) => {
              event.preventDefault();
              const next = promptDraft.trim();
              if (!next) {
                return;
              }
              onPromptAdd(next);
              setPromptDraft("");
            }}
          >
            <input
              type="text"
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              placeholder="Add weighted prompt"
              disabled={!joined}
            />
            <button className="button" type="submit" disabled={!joined || promptDraft.trim().length === 0}>
              Add
            </button>
          </form>

          <label className="toggle-field" style={glowStyle("mute_bass", roleColors, activeRoleByControl)}>
            <span>mute_bass</span>
            <input
              type="checkbox"
              checked={musicConfig.mute_bass}
              disabled={!joined}
              onChange={(event) => patchWithInteraction("mute_bass", { mute_bass: event.target.checked })}
            />
          </label>

          <label className="toggle-field" style={glowStyle("mute_drums", roleColors, activeRoleByControl)}>
            <span>mute_drums</span>
            <input
              type="checkbox"
              checked={musicConfig.mute_drums}
              disabled={!joined}
              onChange={(event) => patchWithInteraction("mute_drums", { mute_drums: event.target.checked })}
            />
          </label>

          <label className="toggle-field" style={glowStyle("only_bass_and_drums", roleColors, activeRoleByControl)}>
            <span>only_bass_and_drums</span>
            <input
              type="checkbox"
              checked={musicConfig.only_bass_and_drums}
              disabled={!joined}
              onChange={(event) =>
                patchWithInteraction("only_bass_and_drums", { only_bass_and_drums: event.target.checked })
              }
            />
          </label>
        </div>

        <div className={`sheet-advanced ${fullOpen ? "visible" : "hidden"}`}>
          <SliderField
            joined={joined}
            label="brightness"
            value={musicConfig.brightness}
            min={0}
            max={1}
            step={0.01}
            controlId="brightness"
            onInteraction={onInteraction}
            onChange={(value) => onPatch({ brightness: value })}
            style={glowStyle("brightness", roleColors, activeRoleByControl)}
          />

          <SliderField
            joined={joined}
            label="density"
            value={musicConfig.density}
            min={0}
            max={1}
            step={0.01}
            controlId="density"
            onInteraction={onInteraction}
            onChange={(value) => onPatch({ density: value })}
            style={glowStyle("density", roleColors, activeRoleByControl)}
          />

          <SliderField
            joined={joined}
            label="temperature"
            value={musicConfig.temperature}
            min={0}
            max={3}
            step={0.01}
            controlId="temperature"
            onInteraction={onInteraction}
            onChange={(value) => onPatch({ temperature: value })}
            style={glowStyle("temperature", roleColors, activeRoleByControl)}
          />

          <SliderField
            joined={joined}
            label="guidance"
            value={musicConfig.guidance}
            min={0}
            max={6}
            step={0.01}
            controlId="guidance"
            onInteraction={onInteraction}
            onChange={(value) => onPatch({ guidance: value })}
            style={glowStyle("guidance", roleColors, activeRoleByControl)}
          />

          <SliderField
            joined={joined}
            label="top_k"
            value={musicConfig.top_k}
            min={1}
            max={1000}
            step={1}
            controlId="top_k"
            onInteraction={onInteraction}
            onChange={(value) => onPatch({ top_k: value })}
            style={glowStyle("top_k", roleColors, activeRoleByControl)}
          />

          <label className="seed-field" style={glowStyle("seed", roleColors, activeRoleByControl)}>
            <span>seed</span>
            <input
              type="number"
              min={0}
              max={2147483647}
              value={musicConfig.seed ?? ""}
              placeholder="random"
              disabled={!joined}
              onFocus={() => onInteraction("seed", true)}
              onBlur={() => onInteraction("seed", false)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                onPatch({ seed: raw === "" ? null : Number(raw) });
              }}
            />
          </label>

          <div className="mode-segment" style={glowStyle("music_generation_mode", roleColors, activeRoleByControl)}>
            <span>mode</span>
            <div>
              {(["QUALITY", "DIVERSITY", "VOCALIZATION"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`segment-button ${musicConfig.music_generation_mode === mode ? "active" : ""}`}
                  onClick={() => patchWithInteraction("music_generation_mode", { music_generation_mode: mode })}
                  type="button"
                  disabled={!joined}
                >
                  {mode.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="advanced-actions">
            <button className="button" type="button" onClick={() => onPlayback("stop")} disabled={!joined}>
              Stop
            </button>
            <button
              className="button"
              type="button"
              onClick={() => onPlayback("reset_context")}
              disabled={!joined}
            >
              Reset Context
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
