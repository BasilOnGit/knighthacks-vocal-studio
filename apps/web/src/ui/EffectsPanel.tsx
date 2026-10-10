import { PARAM_RANGES } from '../../../../shared/params';
import type { EffectNode, Preset } from '../../../../shared/types';

function sliderStep(min: number, max: number): number {
  return max - min <= 2 ? 0.01 : 1;
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(2) : String(value);
}

function effectTypeLabel(node: EffectNode, preset: Preset): string {
  const siblings = preset.chain.filter((entry) => entry.type === node.type);
  if (siblings.length <= 1) {
    return node.type;
  }
  const index = siblings.findIndex((entry) => entry.id === node.id) + 1;
  return `${node.type} ${index}`;
}

export function EffectsPanel({
  preset,
  source,
  onParamChange,
  onEnabledChange,
  onReset,
}: {
  preset: Preset;
  source: string | null;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onReset: () => void;
}) {
  return (
    <section className="preset" aria-label="Preset">
      {source === 'fallback' ? (
        <p className="fixture-label">Using fallback preset, AI unavailable</p>
      ) : null}
      <h2>{preset.name}</h2>
      <p>{preset.explanation}</p>
      <ul className="chain">
        {preset.chain.map((node) => (
          <EffectCard
            key={node.id}
            node={node}
            typeLabel={effectTypeLabel(node, preset)}
            onParamChange={onParamChange}
            onEnabledChange={onEnabledChange}
          />
        ))}
      </ul>
      <button type="button" onClick={onReset}>
        Reset to AI preset
      </button>
    </section>
  );
}

function EffectCard({
  node,
  typeLabel,
  onParamChange,
  onEnabledChange,
}: {
  node: EffectNode;
  typeLabel: string;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
}) {
  const ranges = PARAM_RANGES[node.type];
  return (
    <li>
      <div className="effect-head">
        <div>
          <strong>{typeLabel}</strong>
          {node.why ? <span> — {node.why}</span> : null}
        </div>
        <label className="transport-toggle">
          <input
            type="checkbox"
            checked={node.enabled}
            onChange={(event) => onEnabledChange(node.id, event.target.checked)}
          />
          On
        </label>
      </div>
      <div className="params">
        {Object.entries(ranges).map(([key, range]) => {
          const step = sliderStep(range.min, range.max);
          const value = node.params[key] ?? range.default;
          return (
            <label key={key} className="param">
              <span>{key}</span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={step}
                value={value}
                aria-label={`${node.type} ${key}`}
                onChange={(event) => onParamChange(node.id, key, Number(event.target.value))}
              />
              <span className="param-value">{formatValue(value, step)}</span>
            </label>
          );
        })}
      </div>
    </li>
  );
}
