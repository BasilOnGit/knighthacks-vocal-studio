import React from 'react';
import { PARAM_RANGES } from '../../../../shared/params';
import type { EffectNode, Preset } from '../../../../shared/types';

function sliderStep(min: number, max: number): number {
  return max - min <= 2 ? 0.01 : max <= 5 ? 0.1 : 1;
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(step === 0.01 ? 2 : 1) : String(value);
}

export function EffectsPanel({
  compact = false,
  preset,
  source,
  onParamChange,
  onEnabledChange,
  onReset,
  onRemove,
}: {
  compact?: boolean;
  preset: Preset;
  source: string | null;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onReset?: () => void;
  onRemove: (id: string) => void;
}) {
  const [activeEffect,setActiveEffect]=React.useState('');
  const current=preset.chain.find(node=>node.id===activeEffect)??preset.chain[0];
  return (
    <section className="preset" aria-label="Preset">
      {source === 'fallback' ? (
        <p className="fixture-label">Using fallback preset, AI unavailable</p>
      ) : null}
      <h2>{preset.name}</h2>
      <p>{preset.explanation}</p>
      {compact && preset.chain.length>1 && <label className="active-effect-picker">Edit effect<select aria-label="Edit effect" value={current?.id??''} onChange={e=>setActiveEffect(e.target.value)}>{preset.chain.map(node=><option key={node.id} value={node.id}>{node.type}{node.enabled?'':' (off)'}</option>)}</select></label>}
      <ul className="chain">
        {(compact ? current ? [current] : [] : preset.chain).map((node) => (
          <EffectCard
            key={node.id}
            node={node}
            onParamChange={onParamChange}
            onEnabledChange={onEnabledChange}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {onReset && <button type="button" onClick={onReset}>Reset to generated preset</button>}
    </section>
  );
}

function EffectCard({
  node,
  onParamChange,
  onEnabledChange,
  onRemove,
}: {
  node: EffectNode;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const ranges = PARAM_RANGES[node.type];
  return (
    <li>
      <div className="effect-head">
        <div>
          <strong>{node.type}</strong>
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
      <button type="button" className="remove-effect" aria-label={`Remove ${node.type}`} onClick={()=>onRemove(node.id)}>Remove</button>
      <details open><summary>Fine-tune parameters</summary><div className="params">
        {Object.entries(ranges).map(([key, range]) => {
          const step = sliderStep(range.min, range.max);
          const value = node.params[key] ?? range.default;
          return (
            <label key={key} className="param">
              <span>{key.replace(/([A-Z])/g, ' $1').replace(/Db$/, 'dB').replace(/Hz$/, 'Hz')}</span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={step}
                value={value}
                aria-label={`${node.type} ${key}`}
                onChange={(event) => onParamChange(node.id, key, Number(event.target.value))}
              />
              <input className="param-number" aria-label={`${node.type} ${key} value`} type="number" min={range.min} max={range.max} step={step} value={Number(formatValue(value, step))} onChange={e=>{ const n=e.target.valueAsNumber; if(Number.isFinite(n)) onParamChange(node.id,key,Math.max(range.min,Math.min(range.max,n))); }} />
            </label>
          );
        })}
      </div></details>
    </li>
  );
}
