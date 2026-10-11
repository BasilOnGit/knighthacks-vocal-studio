import React from 'react';
import type { SavedPreset } from '../session/savedPresets';

export function SavedPresetsPanel({
  disabled,
  currentPresetName,
  savedPresets,
  onSave,
  onApply,
  onRemove,
}: {
  disabled: boolean;
  currentPresetName: string;
  savedPresets: SavedPreset[];
  onSave: (name: string) => void;
  onApply: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = React.useState(currentPresetName);

  React.useEffect(() => {
    setName(currentPresetName);
  }, [currentPresetName]);

  return (
    <section className="saved-presets" aria-label="Saved presets">
      <h3 className="section-title">Saved presets</h3>
      <p className="input-help">Stored in this browser tab for the session. Backend sync coming later.</p>
      <div className="saved-presets-save">
        <label>
          Name
          <input
            type="text"
            maxLength={80}
            disabled={disabled}
            value={name}
            placeholder="My vocal chain"
            aria-label="Preset name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(name.trim() || currentPresetName || 'Saved preset')}
        >
          Save current chain
        </button>
      </div>
      {savedPresets.length === 0 ? (
        <p className="saved-presets-empty">No saved presets yet.</p>
      ) : (
        <ul className="saved-presets-list">
          {savedPresets.map((entry) => (
            <li key={entry.id}>
              <div className="saved-presets-meta">
                <strong>{entry.name}</strong>
                <span>
                  {entry.preset.chain.length} effect{entry.preset.chain.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="saved-presets-actions">
                <button type="button" disabled={disabled} onClick={() => onApply(entry.id)}>
                  Apply
                </button>
                <button
                  type="button"
                  className="saved-presets-remove"
                  disabled={disabled}
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => onRemove(entry.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
