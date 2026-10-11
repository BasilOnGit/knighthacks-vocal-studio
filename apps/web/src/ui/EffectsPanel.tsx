import React from 'react';
import { PITCH_CLASS_NAMES } from '../../../../shared/musicKey';
import { PARAM_RANGES, type ParamRange } from '../../../../shared/params';
import type { EffectNode, EffectType, Preset } from '../../../../shared/types';
import { EqSpectrumEditor } from './EqSpectrumEditor';

const GATE_LABELS: Record<string, string> = {
  thresholdDb: 'Threshold',
  attackMs: 'Attack',
  releaseMs: 'Release',
};

const DELAY_LABELS: Record<string, string> = {
  timeMs: 'Time',
  feedback: 'Feedback',
  mix: 'Wet level',
  pingPong: 'Ping-pong',
};

const DENOISE_LABELS: Record<string, string> = {
  amount: 'Amount',
};

const RIDER_LABELS: Record<string, string> = {
  targetDb: 'Target level',
  speed: 'Speed',
  maxGainDb: 'Max boost',
};

const DOUBLER_LABELS: Record<string, string> = {
  mix: 'Mix',
  delayMs: 'Delay',
  width: 'Width',
};

const REVERB_LABELS: Record<string, string> = {
  mix: 'Mix',
  sizePct: 'Size',
  tonePct: 'Tone',
};

const SATURATION_LABELS: Record<string, string> = {
  drive: 'Drive',
  mix: 'Mix',
};

const DEESSER_LABELS: Record<string, string> = {
  freqHz: 'Frequency',
  thresholdDb: 'Threshold',
};

const COMPRESSOR_LABELS: Record<string, string> = {
  thresholdDb: 'Threshold',
  ratio: 'Ratio',
  attackMs: 'Attack',
  releaseMs: 'Release',
  makeupDb: 'Output',
  kneeDb: 'Knee',
  mix: 'Mix',
};

const EQ_LABELS: Record<string, string> = {
  lowShelfDb: 'Low',
  bodyDb: 'Mid',
  airDb: 'High',
  bodyHz: 'Mid sweep',
  lowCutHz: 'High-pass',
  lowShelfHz: 'Low shelf frequency',
  presenceHz: 'Presence frequency',
  presenceDb: 'Presence',
  airHz: 'High shelf frequency',
};

const AUTOTUNE_LABELS: Record<string, string> = {
  mix: 'Correct',
  retuneSpeed: 'Retune speed (up to 400%)',
  speed: 'Legacy speed (unused)',
  snap: 'Snap — note lock (100% = trap / T-Pain style)',
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

function mixControlLabel(type: EffectType): string {
  if (type === 'delay') return 'Wet';
  if (type === 'reverb') return 'Mix';
  if (type === 'compressor') return 'Mix';
  if (type === 'saturation') return 'Mix';
  if (type === 'deesser') return 'Amount';
  if (type === 'autotune') return 'Correct';
  if (type === 'chorus') return 'Wet';
  return 'Mix';
}

function mixPercent(value: number, range: ParamRange): number {
  if (range.unit === 'percent') {
    return Math.round(value);
  }
  const span = range.max - range.min;
  if (span <= 0) {
    return 0;
  }
  return Math.round(((value - range.min) / span) * 100);
}

function paramLabel(type: EffectType, key: string): string {
  if (type === 'gate' && key in GATE_LABELS) {
    return GATE_LABELS[key];
  }
  if (type === 'delay' && key in DELAY_LABELS) {
    return DELAY_LABELS[key];
  }
  if (type === 'reverb' && key in REVERB_LABELS) {
    return REVERB_LABELS[key];
  }
  if (type === 'saturation' && key in SATURATION_LABELS) {
    return SATURATION_LABELS[key];
  }
  if (type === 'deesser' && key in DEESSER_LABELS) {
    return DEESSER_LABELS[key];
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
  if (type === 'denoise' && key in DENOISE_LABELS) {
    return DENOISE_LABELS[key];
  }
  if (type === 'rider' && key in RIDER_LABELS) {
    return RIDER_LABELS[key];
  }
  if (type === 'doubler' && key in DOUBLER_LABELS) {
    return DOUBLER_LABELS[key];
  }
  if (key === 'pingPong') {
    return 'Ping-pong';
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
  preset,
  source,
  trackLabel,
  trackId,
  getSpectrumDb,
  audioSampleRate,
  editedSinceGenerate,
  generateSummary,
  onParamChange,
  onEnabledChange,
  onReset,
  onRemove,
  onMove,
  onClearAll,
  clearAllDisabled,
}: {
  preset: Preset;
  source: string | null;
  trackLabel?: string;
  trackId?: string;
  getSpectrumDb?: () => Float32Array | null;
  audioSampleRate?: number;
  editedSinceGenerate?: boolean;
  generateSummary?: string[] | null;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onReset?: () => void;
  onRemove: (id: string) => void;
  onMove?: (id: string, delta: -1 | 1) => void;
  onClearAll?: () => void;
  clearAllDisabled?: boolean;
}) {
  return (
    <section className="preset" aria-label="Preset">
      {trackLabel ? <p className="track-fx-label">Track effects · {trackLabel}</p> : null}
      {source === 'fallback' ? (
        <p className="fixture-label">Using fallback preset, AI unavailable</p>
      ) : null}
      {generateSummary && generateSummary.length > 0 ? (
        <ul className="preset-change-summary">
          {generateSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {editedSinceGenerate && onReset ? (
        <p className="preset-edited-hint">
          You changed settings since the last AI generate.{' '}
          <button type="button" className="preset-reset-inline" onClick={onReset}>
            Reset to generated chain
          </button>
        </p>
      ) : null}
      <div className="preset-heading-row">
        <h2>{preset.name}</h2>
        {onClearAll ? (
          <button
            type="button"
            className="preset-clear-all"
            disabled={clearAllDisabled}
            onClick={onClearAll}
          >
            Clear all effects
          </button>
        ) : null}
      </div>
      <p>{preset.explanation}</p>
      <ul className="chain">
        {preset.chain.map((node, index) => (
          <EffectCard
            key={node.id}
            node={node}
            typeLabel={effectTypeLabel(node, preset)}
            canMoveUp={index > 0}
            canMoveDown={index < preset.chain.length - 1}
            onMove={onMove}
            onParamChange={onParamChange}
            onEnabledChange={onEnabledChange}
            onRemove={onRemove}
            trackId={trackId}
            getSpectrumDb={getSpectrumDb}
            audioSampleRate={audioSampleRate}
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
  canMoveUp,
  canMoveDown,
  onMove,
  onParamChange,
  onEnabledChange,
  onRemove,
  trackId,
  getSpectrumDb,
  audioSampleRate,
}: {
  node: EffectNode;
  typeLabel: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove?: (id: string, delta: -1 | 1) => void;
  onParamChange: (id: string, key: string, value: number) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  trackId?: string;
  getSpectrumDb?: () => Float32Array | null;
  audioSampleRate?: number;
}) {
  const ranges = PARAM_RANGES[node.type];
  const mixRange = 'mix' in ranges ? ranges.mix : null;
  const mixValue = mixRange ? (node.params.mix ?? mixRange.default) : 0;
  const paramEntries = Object.entries(ranges).filter(([key]) => key !== 'mix');
  const primaryParams = paramEntries.filter(([, range]) => !range.advanced);
  const advancedParams = paramEntries.filter(([, range]) => range.advanced);

  function renderParam(key: string, range: ParamRange) {
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

    const unitSuffix =
      range.unit === 'percent'
        ? '%'
        : range.unit === 'db'
          ? ' dB'
          : range.unit === 'ms'
            ? ' ms'
            : range.unit === 'hz'
              ? ' Hz'
              : range.unit === 'ratio'
                ? ':1'
                : '';

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
        <input
          className="param-number"
          aria-label={`${node.type} ${key} value`}
          type="number"
          min={range.min}
          max={range.max}
          step={step}
          value={Number(formatValue(value, step))}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) {
              onParamChange(node.id, key, Math.max(range.min, Math.min(range.max, n)));
            }
          }}
        />
        {unitSuffix ? <span className="param-unit">{unitSuffix}</span> : null}
      </label>
    );
  }

  return (
    <li className="effect-card">
      <div className="effect-card-layout">
        <div className="effect-card-main">
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
          {onMove ? (
            <div className="effect-order-actions">
              <button
                type="button"
                disabled={!canMoveUp}
                aria-label={`Move ${node.type} up`}
                onClick={() => onMove(node.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                aria-label={`Move ${node.type} down`}
                onClick={() => onMove(node.id, 1)}
              >
                ↓
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="remove-effect"
            aria-label={`Remove ${node.type}`}
            onClick={() => onRemove(node.id)}
          >
            Remove
          </button>
          {node.type === 'eq' ? (
            <EqSpectrumEditor
              params={node.params}
              enabled={node.enabled}
              onParamChange={(key, value) => onParamChange(node.id, key, value)}
              getSpectrumDb={trackId ? getSpectrumDb : undefined}
              sampleRate={audioSampleRate}
            />
          ) : null}
          <details open={node.type !== 'eq'}>
            <summary>{node.type === 'eq' ? 'Fine sliders' : 'Parameters'}</summary>
            <div className="params">
              {node.type === 'eq'
                ? paramEntries.map(([key, range]) => renderParam(key, range))
                : primaryParams.map(([key, range]) => renderParam(key, range))}
            </div>
            {node.type !== 'eq' && advancedParams.length > 0 ? (
              <details className="params-advanced">
                <summary>More</summary>
                <div className="params">
                  {advancedParams.map(([key, range]) => renderParam(key, range))}
                </div>
              </details>
            ) : null}
          </details>
        </div>
        {mixRange ? (
          <label className="effect-mix" aria-label={paramLabel(node.type, 'mix')}>
            <span className="effect-mix__value">{mixPercent(mixValue, mixRange)}%</span>
            <input
              className="effect-mix__slider"
              type="range"
              min={mixRange.min}
              max={mixRange.max}
              step={sliderStep(mixRange.min, mixRange.max)}
              value={mixValue}
              onChange={(event) =>
                onParamChange(node.id, 'mix', Number(event.target.value))
              }
            />
            <span className="effect-mix__label">{mixControlLabel(node.type)}</span>
          </label>
        ) : null}
      </div>
    </li>
  );
}
