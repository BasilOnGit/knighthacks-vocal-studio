import type { Preset, VoiceFeatures } from './types.ts';

/** Matches track mixer fader in `TrackMixer.tsx`. */
export const TRACK_VOLUME_DB_MIN = -36;
export const TRACK_VOLUME_DB_MAX = 6;

export function clampTrackVolumeDb(db: number): number {
  if (!Number.isFinite(db)) {
    return 0;
  }
  return Math.min(TRACK_VOLUME_DB_MAX, Math.max(TRACK_VOLUME_DB_MIN, db));
}

/** Heuristic fader when the model omits `trackVolumeDb` (fallback / seed path). */
export function suggestTrackVolumeDb(prompt: string, features: VoiceFeatures): number {
  const text = prompt.normalize('NFKC').toLowerCase();
  let db = 0;

  if (/\b(whisper|intimate|soft|quiet|background|under the beat|sit back|melt into)\b/.test(text)) {
    db -= 3;
  }
  if (/\b(buried|lower the vocal|pull vocal down|behind the beat)\b/.test(text)) {
    db -= 5;
  }
  if (/\b(anthem|stadium|loud|upfront|lead vocal|belt|scream|aggressive|punchy)\b/.test(text)) {
    db += 2;
  }
  if (/\b(podcast|spoken|voiceover|narration)\b/.test(text)) {
    db -= 2;
  }
  if (/\b(dream|ethereal|spacious|reverb heavy)\b/.test(text)) {
    db -= 1;
  }

  if (features.loudnessDb < -26) {
    db += 2;
  } else if (features.loudnessDb > -16) {
    db -= 2;
  }
  if (features.crestDb > 14) {
    db -= 1;
  }

  return clampTrackVolumeDb(db);
}

export function resolveTrackVolumeDb(
  preset: Preset,
  prompt: string,
  features: VoiceFeatures,
  currentFaderDb?: number,
): number {
  if (typeof preset.trackVolumeDb === 'number' && Number.isFinite(preset.trackVolumeDb)) {
    return clampTrackVolumeDb(preset.trackVolumeDb);
  }
  if (currentFaderDb !== undefined && Number.isFinite(currentFaderDb)) {
    return clampTrackVolumeDb(currentFaderDb);
  }
  return suggestTrackVolumeDb(prompt, features);
}

export function withResolvedTrackVolume(
  preset: Preset,
  prompt: string,
  features: VoiceFeatures,
  currentFaderDb?: number,
): Preset {
  return {
    ...preset,
    trackVolumeDb: resolveTrackVolumeDb(preset, prompt, features, currentFaderDb),
  };
}
