/** Pitch-class index 0–11 stored in autotune `key` (0 = C). */
export const PITCH_CLASS_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export function pitchClassIndex(key: number): number {
  return ((Math.round(key) % 12) + 12) % 12;
}

export function pitchClassName(key: number): string {
  return PITCH_CLASS_NAMES[pitchClassIndex(key)];
}
