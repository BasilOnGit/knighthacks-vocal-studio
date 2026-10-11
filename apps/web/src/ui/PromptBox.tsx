import React, { type FormEvent } from 'react';
import type { VoiceFeatures } from '../../../../shared/types';
import type { AiTurn } from '../session/aiThread';

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
    hints.push('Noisy room — try denoise, gate, or a cleaner take in the prompt.');
  }
  if (features.crestDb > 14) {
    hints.push('Big level swings — mention rider or smooth broadcast level.');
  }
  if (features.centroidHz > 3200) {
    hints.push('Bright voice — ask for less air or a darker tone if it feels harsh.');
  }
  if (features.centroidHz < 2200) {
    hints.push('Dark voice — presence or air in the prompt can help clarity.');
  }
  if (features.loudnessDb < -24) {
    hints.push('Quiet recording — compression or makeup in the prompt may help.');
  }
  return hints;
}

export function PromptBox({
  prompt,
  busy,
  hasTake,
  features,
  thread,
  trackLabel,
  otherTrackNames,
  onPromptChange,
  onGenerate,
  onFollowUp,
  onNewConversation,
}: {
  prompt: string;
  busy: boolean;
  hasTake: boolean;
  features: VoiceFeatures | null;
  thread: AiTurn[];
  trackLabel?: string;
  otherTrackNames?: string[];
  onPromptChange: (value: string) => void;
  onGenerate: (event: FormEvent) => void;
  onFollowUp: (event: FormEvent) => void;
  onNewConversation: () => void;
}) {
  const hints = features ? featureHints(features) : [];
  const isFollowUp = thread.length > 0;

  return (
    <form
      className="prompt-form"
      onSubmit={isFollowUp ? onFollowUp : onGenerate}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR SOUND, IN WORDS</span>
          <h2>Shape your vocal</h2>
        </div>
        <span className="status-pill">{hasTake ? 'Take ready' : 'Record a take first'}</span>
      </div>
      <p className="ai-honesty">
        The AI reads your text and measured voice stats — not the raw audio.
        {trackLabel ? ` Chat is per track (${trackLabel}).` : ''}
        {otherTrackNames && otherTrackNames.length > 0
          ? ` Generate also reads ${otherTrackNames.join(', ')} for consistency.`
          : ''}
      </p>
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
            <li key={`${turn.at}-${index}`}>
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
        {isFollowUp ? 'Follow-up' : 'Describe the sound you want'}
      </label>
      <textarea
        id="prompt"
        maxLength={1000}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={
          isFollowUp
            ? 'e.g. less reverb, brighter, more autotune…'
            : 'Try: intimate vocals, a warm tone, and a soft echo…'
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
        <button className="generate-button" disabled={busy || !hasTake || !prompt.trim()}>
          {busy ? 'Finding your sound…' : isFollowUp ? 'Follow up ↗' : 'Generate ↗'}
        </button>
      </div>
      <p className="input-help">
        {hasTake
          ? 'Presets apply to the whole track (all clips on that track). Fine-tune every effect in the Effects tab.'
          : 'Record a vocal using the red Record button, then choose a style or write your own.'}
      </p>
    </form>
  );
}
