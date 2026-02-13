import { useEffect, useRef, useState } from "react";

import type { PlaybackState, Role, ScaleEnum } from "../lib/types";
import { SCALE_OPTIONS } from "../lib/scales";

interface TopBarProps {
  joined: boolean;
  connected: boolean;
  playbackState: PlaybackState;
  roleColors: Record<Role, string>;
  activeRoleByControl: (controlId: string) => Role | null;
  onJoin: () => void;
  onTogglePlayback: () => void;
  bpm: number;
  onBpmChange: (value: number) => void;
  onBpmInteraction: (active: boolean) => void;
  scale: ScaleEnum;
  onScaleChange: (value: ScaleEnum) => void;
  onScaleInteraction: (active: boolean) => void;
  shareUrl: string | null;
}

function clampBpm(value: number): number {
  return Math.max(60, Math.min(200, Math.round(value)));
}

export function TopBar({
  joined,
  connected,
  playbackState,
  roleColors,
  activeRoleByControl,
  onJoin,
  onTogglePlayback,
  bpm,
  onBpmChange,
  onBpmInteraction,
  scale,
  onScaleChange,
  onScaleInteraction,
  shareUrl,
}: TopBarProps) {
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(String(bpm));

  const dragActive = useRef(false);
  const dragStartY = useRef(0);
  const dragStartBpm = useRef(bpm);

  useEffect(() => {
    if (!isEditingBpm) {
      setBpmDraft(String(bpm));
    }
  }, [bpm, isEditingBpm]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragActive.current) {
        return;
      }
      const deltaY = dragStartY.current - event.clientY;
      const bpmDelta = deltaY / 6;
      onBpmChange(clampBpm(dragStartBpm.current + bpmDelta));
    };

    const onPointerUp = () => {
      if (!dragActive.current) {
        return;
      }
      dragActive.current = false;
      onBpmInteraction(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onBpmChange, onBpmInteraction]);

  const playbackRole = activeRoleByControl("playback");
  const bpmRole = activeRoleByControl("bpm");
  const scaleRole = activeRoleByControl("scale");

  return (
    <header className="top-bar">
      <button className="button join-button" onClick={onJoin}>
        {joined ? (connected ? "Joined" : "Rejoin") : "Join"}
      </button>

      <button
        className="button transport-button"
        onClick={onTogglePlayback}
        disabled={!joined}
        style={playbackRole ? { boxShadow: `0 0 18px ${roleColors[playbackRole]}` } : undefined}
      >
        {playbackState === "playing" ? "Pause" : "Play"}
      </button>

      <div
        className="bpm-cluster"
        aria-label="BPM control"
        style={bpmRole ? { boxShadow: `0 0 18px ${roleColors[bpmRole]}` } : undefined}
      >
        <button className="button bpm-arrow" onClick={() => onBpmChange(clampBpm(bpm - 1))} disabled={!joined}>
          ↓
        </button>

        {isEditingBpm ? (
          <input
            className="bpm-input"
            inputMode="numeric"
            pattern="[0-9]*"
            value={bpmDraft}
            onChange={(event) => setBpmDraft(event.target.value)}
            onBlur={() => {
              const value = Number(bpmDraft);
              if (!Number.isNaN(value)) {
                onBpmChange(clampBpm(value));
              }
              setIsEditingBpm(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const value = Number(bpmDraft);
                if (!Number.isNaN(value)) {
                  onBpmChange(clampBpm(value));
                }
                setIsEditingBpm(false);
              }
            }}
          />
        ) : (
          <button
            className="bpm-value"
            onClick={() => setIsEditingBpm(true)}
            onPointerDown={(event) => {
              if (!joined) {
                return;
              }
              dragActive.current = true;
              dragStartY.current = event.clientY;
              dragStartBpm.current = bpm;
              onBpmInteraction(true);
            }}
            disabled={!joined}
          >
            {bpm}
          </button>
        )}

        <button className="button bpm-arrow" onClick={() => onBpmChange(clampBpm(bpm + 1))} disabled={!joined}>
          ↑
        </button>
      </div>

      <label
        className="scale-select-wrap"
        style={scaleRole ? { boxShadow: `0 0 18px ${roleColors[scaleRole]}` } : undefined}
      >
        <span>Scale</span>
        <select
          value={scale}
          onChange={(event) => onScaleChange(event.target.value as ScaleEnum)}
          onFocus={() => onScaleInteraction(true)}
          onBlur={() => onScaleInteraction(false)}
          disabled={!joined}
        >
          {SCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {shareUrl ? (
        <button
          className="button share-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
            } catch {
              // ignore clipboard failures in non-secure contexts.
            }
          }}
        >
          Copy Link
        </button>
      ) : null}
    </header>
  );
}
