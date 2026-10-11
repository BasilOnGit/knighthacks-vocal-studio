import { pitchClassName } from '../../../../shared/musicKey';
import type { VoiceFeatures } from '../../../../shared/types';

export function FeatureList({
  features,
  warnings,
}: {
  features: VoiceFeatures;
  warnings: string[];
}) {
  return (
    <div>
      <dl className="features">
        <div>
          <dt>Avg. level</dt>
          <dd>{formatDb(features.loudnessDb)} dB</dd>
        </div>
        <div>
          <dt>Peak level</dt>
          <dd>{formatDb(features.peakDb)} dB</dd>
        </div>
        <div>
          <dt>Tone center</dt>
          <dd>{formatHz(features.centroidHz)} Hz</dd>
        </div>
        <div>
          <dt>Pitch</dt>
          <dd>{formatHz(features.pitchHz)} Hz</dd>
        </div>
        <div>
          <dt>Noise floor</dt>
          <dd>{formatDb(features.noiseFloorDb)} dB</dd>
        </div>
        <div>
          <dt>Voiced time</dt>
          <dd>{formatSeconds(features.voicedSeconds)} s</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>
            {features.keyConfidence > 0
              ? `${pitchClassName(features.key)} ${features.scaleMajor >= 0.5 ? 'major' : 'minor'} (${formatPercent(features.keyConfidence)})`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>{features.bpm > 0 ? `${features.bpm} BPM` : '—'}</dd>
        </div>
        <div>
          <dt>Pitch stability</dt>
          <dd>{formatPercent(features.pitchStability)}</dd>
        </div>
      </dl>
      {warnings.length > 0 ? (
        <ul className="measure-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatDb(value: number): string {
  return value.toFixed(1);
}

function formatHz(value: number): string {
  return String(Math.round(value));
}

function formatSeconds(value: number): string {
  return value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
