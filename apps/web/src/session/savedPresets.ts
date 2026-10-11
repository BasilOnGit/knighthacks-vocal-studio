import { validatePreset } from '../../../../shared/validate.ts';
import type { Preset } from '../../../../shared/types.ts';

export const SESSION_SAVED_PRESETS_KEY = 'vocal-studio.saved-presets';
export const MAX_SAVED_PRESETS = 24;

export type SavedPreset = {
  id: string;
  name: string;
  preset: Preset;
  savedAt: number;
};

export function snapshotPreset(preset: Preset): Preset {
  return validatePreset(structuredClone(preset));
}

/** Fresh effect ids so the same saved preset can be applied to multiple clips. */
export function presetForApply(preset: Preset): Preset {
  const validated = validatePreset({
    name: preset.name,
    explanation: preset.explanation,
    chain: preset.chain.map((node) => ({
      type: node.type,
      enabled: node.enabled,
      params: { ...node.params },
      ...(node.why !== undefined ? { why: node.why } : {}),
    })),
  });
  return {
    ...validated,
    chain: validated.chain.map((node) => ({
      ...node,
      id: crypto.randomUUID(),
    })),
  };
}

export function loadSavedPresetsFromSession(): SavedPreset[] {
  if (typeof sessionStorage === 'undefined') {
    return [];
  }
  try {
    const raw = sessionStorage.getItem(SESSION_SAVED_PRESETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedPreset[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.name === 'string' &&
          entry.preset &&
          typeof entry.savedAt === 'number',
      )
      .slice(0, MAX_SAVED_PRESETS)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        preset: validatePreset(entry.preset),
        savedAt: entry.savedAt,
      }));
  } catch {
    return [];
  }
}

export function persistSavedPresetsToSession(presets: SavedPreset[]): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(
      SESSION_SAVED_PRESETS_KEY,
      JSON.stringify(presets.slice(0, MAX_SAVED_PRESETS)),
    );
  } catch {
    // Quota or private mode — in-memory state still works for this tab.
  }
}
