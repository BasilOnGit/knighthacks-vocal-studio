import type { FormEvent } from 'react';

type PromptBoxProps = {
  prompt: string;
  busy: boolean;
  hasTake: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: (event: FormEvent) => void;
};

export function PromptBox({
  prompt,
  busy,
  hasTake,
  onPromptChange,
  onGenerate,
}: PromptBoxProps) {
  return (
    <form onSubmit={onGenerate}>
      <label htmlFor="prompt">Vocal style</label>
      <textarea
        id="prompt"
        maxLength={1000}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Warm R&B vocals with a little reverb…"
        required
      />
      <button disabled={busy || !hasTake || !prompt.trim()}>
        {busy ? 'Generating…' : 'Generate preset'}
      </button>
    </form>
  );
}
