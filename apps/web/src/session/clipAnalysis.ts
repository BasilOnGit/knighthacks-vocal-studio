import type { Snippet } from './snippets';

/** Identity for analysis — ignores mix state (volume, pan, timeline position, track lane). */
export function clipAnalysisKey(clip: Snippet): string {
  return [
    clip.id,
    clip.buffer.length,
    clip.buffer.sampleRate,
    clip.trim.start,
    clip.trim.end,
  ].join(':');
}
