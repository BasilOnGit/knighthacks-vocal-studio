import type { VoiceFeatures } from '../../../../shared/types';
import type { Snippet } from '../session/snippets';
import { analyze } from './analyze';
import { detectBpm } from './detectBpm';
import { detectKey } from './detectKey';

/** Vocal clip analysis; BPM and musical key from the beat clip when present. */
export function buildVoiceFeatures(
  vocalClip: Snippet,
  beatClip?: Snippet | null,
): VoiceFeatures {
  const vocal = analyze(vocalClip.buffer, vocalClip.trim.start, vocalClip.trim.end);
  if (!beatClip) {
    return { ...vocal, bpm: 0 };
  }
  const bpm = detectBpm(beatClip.buffer, beatClip.trim.start, beatClip.trim.end);
  const beatKey = detectKey(beatClip.buffer, beatClip.trim.start, beatClip.trim.end);
  return {
    ...vocal,
    key: beatKey.key,
    scaleMajor: beatKey.scaleMajor,
    keyConfidence: beatKey.keyConfidence,
    bpm,
  };
}
