import React, { type FormEvent } from 'react';
import type { VoiceFeatures } from '../../../../shared/types';
import type { AiTurn } from '../session/aiThread';
import { ICON_SIZE, ICON_STROKE, Wand2 } from './icons';
import { InspectorSection } from './InspectorSection';

const STYLES: Record<string, string> = {
  'Warm R&B': 'Warm, intimate R&B vocals with gentle compression and a short reverb.',
  'Dream pop': 'Dreamy, spacious vocals with airy EQ, subtle doubler, ping-pong delay and lush reverb.',
  'Punchy rap': 'Punchy, upfront rap vocals with tight compression and subtle saturation.',
  'Lo-fi': 'Gritty lo-fi vocals with a darker tone and subtle distortion.',
  'Clean pop': 'Clear, bright pop vocals with balanced compression and a light room reverb.',
};

function featureHints(features: VoiceFeatures): string[] {
  const hints: string[] = [];
  if (features.noiseFloorDb > -45) {
    hints.push('Background noise is elevated — try denoise or a noise gate.');
  }
  if (features.crestDb > 14) {
    hints.push('Levels move a lot — a compressor or level rider can even them out.');
  }
  if (features.centroidHz > 3200) {
    hints.push('The take is bright — mention less air or a darker tone if it feels harsh.');
  }
  if (features.centroidHz < 2200) {
    hints.push('The take is dark — ask for more presence or clarity in the prompt.');
  }
  if (features.loudnessDb < -24) {
    hints.push('The take is quiet — compression or makeup gain in the prompt may help.');
  }
  return hints;
}

export function PromptBox({
  prompt,
  busy,
  hasTrackAudio,
  features,
  thread,
  onPromptChange,
  onGenerate,
  onFollowUp,
  onNewConversation,
}: {
  prompt: string;
  busy: boolean;
  hasTrackAudio: boolean;
  features: VoiceFeatures | null;
  thread: AiTurn[];
  onPromptChange: (value: string) => void;
  onGenerate: (event: FormEvent) => void;
  onFollowUp: (event: FormEvent) => void;
  onNewConversation: () => void;
}) {
  const hints = features ? featureHints(features) : [];
  const isFollowUp = thread.length > 0;
  const statusLabel = !hasTrackAudio
    ? 'Add audio to this track'
    : !features
      ? 'Analyzing…'
      : 'Ready';

  return (
    <form
      className="prompt-form inspector-panel"
      onSubmit={isFollowUp ? onFollowUp : onGenerate}
    >
      <InspectorSection title="Style">
        <span className="status-pill">{statusLabel}</span>
      </InspectorSection>
      <details className="ai-stats-details">
        <summary>How generation uses your take</summary>
        <p className="input-help">
          Your prompt is combined with measured stats from this track&apos;s audio (not the raw
          waveform). Generated presets apply to the whole track.
        </p>
      </details>
      <div className="style-chips" aria-label="Style suggestions">
        {Object.entries(STYLES).map(([name, text]) => (
          <button
            key={name}
            type="button"
            disabled={busy}
            onClick={() => onPromptChange(text)}
          >
            {name}
          </button>
        ))}
      </div>
      {thread.length > 0 ? (
        <ol className="ai-thread" aria-label="Prior AI turns">
          {thread.map((turn, index) => (
            <li key={`${turn.at}-${index}`} className="card ai-thread-card">
              <p className="ai-thread-user"><strong>You:</strong> {turn.prompt}</p>
              <p className="ai-thread-assistant">
                <strong>{turn.name}</strong> — {turn.explanation}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {hints.length > 0 ? (
        <ul className="prompt-feature-hints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}
      <label htmlFor="prompt">
        {isFollowUp ? 'Follow-up' : 'Describe the sound'}
      </label>
      <textarea
        id="prompt"
        maxLength={1000}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={
          isFollowUp
            ? 'e.g. less reverb, brighter, more pitch correction…'
            : 'e.g. warm vocal, light compression, short room reverb…'
        }
        required
      />
      <div className="prompt-bottom">
        <small>{prompt.length}/1000</small>
        {isFollowUp ? (
          <button
            type="button"
            className="prompt-secondary"
            disabled={busy}
            onClick={onNewConversation}
          >
            New conversation
          </button>
        ) : null}
        <button
          className="generate-button btn-primary"
          disabled={busy || !hasTrackAudio || !features || !prompt.trim()}
        >
          <Wand2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          {busy ? 'Working…' : isFollowUp ? 'Refine' : 'Generate'}
        </button>
      </div>
    </form>
  );
}
