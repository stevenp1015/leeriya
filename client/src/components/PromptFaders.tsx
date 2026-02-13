import type { Role, WeightedPrompt } from "../lib/types";

interface PromptFadersProps {
  prompts: WeightedPrompt[];
  activeRoleByControl: (controlId: string) => Role | null;
  roleColors: Record<Role, string>;
  onWeightChange: (promptId: string, weight: number) => void;
  onRemove: (promptId: string) => void;
  onInteraction: (controlId: string, active: boolean) => void;
}

function colorForWeight(weight: number): string {
  const normalized = Math.max(0, Math.min(1, (weight + 10) / 20));
  const hue = 190 - (normalized * 120);
  const saturation = 55 + (normalized * 35);
  const lightness = 40 + (normalized * 22);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function PromptFaders({
  prompts,
  activeRoleByControl,
  roleColors,
  onWeightChange,
  onRemove,
  onInteraction,
}: PromptFadersProps) {
  return (
    <section className="prompt-faders" aria-label="Prompt weights">
      {prompts.length === 0 ? (
        <div className="prompt-empty">Add a prompt below to spawn a live weight fader.</div>
      ) : null}

      {prompts.map((prompt) => {
        const controlId = `prompt:${prompt.id}`;
        const activeRole = activeRoleByControl(controlId);
        const glowColor = activeRole ? roleColors[activeRole] : "transparent";

        return (
          <article
            key={prompt.id}
            className="prompt-fader-card"
            style={{ boxShadow: activeRole ? `0 0 22px ${glowColor}` : undefined }}
          >
            <button className="prompt-remove" onClick={() => onRemove(prompt.id)} aria-label="Remove prompt">
              ×
            </button>

            <input
              className="vertical-fader"
              type="range"
              min={-10}
              max={10}
              step={0.01}
              value={prompt.weight}
              onChange={(event) => onWeightChange(prompt.id, Number(event.target.value))}
              onPointerDown={() => onInteraction(controlId, true)}
              onPointerUp={() => onInteraction(controlId, false)}
              onPointerCancel={() => onInteraction(controlId, false)}
              style={{ accentColor: colorForWeight(prompt.weight) }}
            />

            <div className="prompt-weight-chip" style={{ background: colorForWeight(prompt.weight) }}>
              {prompt.weight.toFixed(2)}
            </div>
            <p className="prompt-label">{prompt.text}</p>
          </article>
        );
      })}
    </section>
  );
}
