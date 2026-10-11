import React from 'react';
import type { SavedPreset } from '../session/savedPresets';
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ICON_SIZE,
  ICON_STROKE,
  Trash2,
} from './icons';
import { InspectorSection } from './InspectorSection';

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
    <InspectorSection title="Saved presets" icon={Bookmark} className="saved-presets">
      <p className="input-help saved-presets-note">Saved on this device</p>
      <div className="saved-presets-save card">
        <label className="saved-presets-name">
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
          className="btn-primary saved-presets-save-btn"
          disabled={disabled}
          aria-label="Save current chain"
          title="Save"
          onClick={() => onSave(name.trim() || currentPresetName || 'Saved preset')}
        >
          <BookmarkPlus size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          Save
        </button>
      </div>
      {savedPresets.length === 0 ? (
        <p className="inspector-empty">No saved presets yet.</p>
      ) : (
        <ul className="saved-presets-list">
          {savedPresets.map((entry) => (
            <li key={entry.id} className="card saved-presets-card">
              <div className="saved-presets-meta">
                <strong>{entry.name}</strong>
                <span>
                  {entry.preset.chain.length} effect{entry.preset.chain.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="saved-presets-actions">
                <button
                  type="button"
                  className="btn-icon"
                  disabled={disabled}
                  aria-label={`Apply ${entry.name}`}
                  title="Apply"
                  onClick={() => onApply(entry.id)}
                >
                  <Check size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon--danger saved-presets-remove"
                  disabled={disabled}
                  aria-label={`Remove ${entry.name}`}
                  title="Remove"
                  onClick={() => onRemove(entry.id)}
                >
                  <Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InspectorSection>
  );
}
