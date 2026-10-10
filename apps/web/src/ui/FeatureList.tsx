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
          <dt>Loudness</dt>
          <dd>{formatDb(features.loudnessDb)} dB</dd>
        </div>
        <div>
          <dt>Peak</dt>
          <dd>{formatDb(features.peakDb)} dB</dd>
        </div>
        <div>
          <dt>Brightness</dt>
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
          <dt>Voiced</dt>
          <dd>{formatSeconds(features.voicedSeconds)}s</dd>
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
