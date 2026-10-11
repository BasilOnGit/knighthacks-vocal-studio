import React from 'react';
import { PITCH_CLASS_NAMES } from '../../../../shared/musicKey';
import { PARAM_RANGES } from '../../../../shared/params';
import type { EffectNode, EffectType, Preset } from '../../../../shared/types';

const DELAY_LABELS: Record<string, string> = {
  timeMs: 'Delay time',
  feedback: 'Feedback — repeats (filtered to stay vocal-friendly)',
  mix: 'Blend — dry vs delay',
};

const REVERB_LABELS: Record<string, string> = {
  decaySec: 'Decay — room length',
  preDelayMs: 'Pre-delay — space before the tail',
  mix: 'Blend — dry vs reverb',
};

const SATURATION_LABELS: Record<string, string> = {
  drive: 'Harmonics — warmth and edge (parallel blend keeps it natural)',
  mix: 'Blend — dry vs saturated',
};

const COMPRESSOR_LABELS: Record<string, string> = {
  thresholdDb: 'Threshold — level where compression starts',
  ratio: 'Ratio — amount of gain reduction',
  attackMs: 'Attack — how fast gain reduction kicks in',
  releaseMs: 'Release — how fast the vocal opens back up',
  makeupDb: 'Makeup gain on compressed signal',
  kneeDb: 'Knee — soft = smoother, hard = more grabby',
  mix: 'Blend — dry vs compressed (parallel)',
};

const EQ_LABELS: Record<string, string> = {
  lowCutHz: 'High-pass — rumble and room below this',
  lowShelfHz: 'Low shelf frequency',
  lowShelfDb: 'Low warmth — body and weight',
  bodyHz: 'Mud / body center',
  bodyDb: 'Mud cut or body boost',
  presenceHz: 'Presence — consonants and cut',
  presenceDb: 'Forward presence',
  airHz: 'Air band — brightness shelf',
  airDb: 'Air and shimmer',
};

const AUTOTUNE_LABELS: Record<string, string> = {
  mix: 'Mix — amount of pitch correction (0 = bypass, 1 = full)',
  retuneSpeed: 'Retune speed — higher locks to notes faster',
  speed: 'Legacy tuning knob (reserved; formant engine ignores this)',
  snap: 'Snap — how hard notes pull to the scale',
  key: 'Key',
  scaleMajor: 'Scale',
  shiftSemitones: 'Pitch shift (semitones)',
};

function sliderStep(min: number, max: number): number {
  return max - min <= 2 ? 0.01 : max <= 5 ? 0.1 : 1;
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(step === 0.01 ? 2 : 1) : String(value);
}

function paramLabel(type: EffectType, key: string): string {
  if (type === 'delay' && key in DELAY_LABELS) {
    return DELAY_LABELS[key];
  }
  if (type === 'reverb' && key in REVERB_LABELS) {
    return REVERB_LABELS[key];
  }
  if (type === 'saturation' && key in SATURATION_LABELS) {
    return SATURATION_LABELS[key];
  }
  if (type === 'compressor' && key in COMPRESSOR_LABELS) {
    return COMPRESSOR_LABELS[key];
  }
  if (type === 'eq' && key in EQ_LABELS) {
    return EQ_LABELS[key];
  }
  if (type === 'autotune' && key in AUTOTUNE_LABELS) {
    return AUTOTUNE_LABELS[key];
  }
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/Db$/, 'dB')
    .replace(/Hz$/, 'Hz');
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
            typeLabel={effectTypeLabel(node, preset)}
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
  typeLabel,
  onParamChange,
  onEnabledChange,
  onRemove,
}: {
  node: EffectNode;
  typeLabel: string;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
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
      <button type="button" className="remove-effect" aria-label={`Remove ${node.type}`} onClick={()=>onRemove(node.id)}>Remove</button>
      <details open><summary>Fine-tune parameters</summary><div className="params">
        {Object.entries(ranges).map(([key, range]) => {
          const step = sliderStep(range.min, range.max);
          const value = node.params[key] ?? range.default;
          const label = paramLabel(node.type, key);

          if (node.type === 'autotune' && key === 'key') {
            const keyIndex = Math.min(11, Math.max(0, Math.round(value)));
            return (
              <label key={key} className="param param--select">
                <span>{label}</span>
                <select
                  aria-label={`${node.type} key`}
                  value={keyIndex}
                  onChange={(event) =>
                    onParamChange(node.id, key, Number(event.target.value))
                  }
                >
                  {PITCH_CLASS_NAMES.map((name, index) => (
                    <option key={name} value={index}>{name}</option>
                  ))}
                </select>
              </label>
            );
          }

          if (node.type === 'autotune' && key === 'scaleMajor') {
            const major = value >= 0.5 ? 1 : 0;
            return (
              <label key={key} className="param param--select">
                <span>{label}</span>
                <select
                  aria-label={`${node.type} scale`}
                  value={major}
                  onChange={(event) =>
                    onParamChange(node.id, key, Number(event.target.value))
                  }
                >
                  <option value={1}>Major</option>
                  <option value={0}>Minor</option>
                </select>
              </label>
            );
          }

          return (
            <label key={key} className="param">
              <span>{label}</span>
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
