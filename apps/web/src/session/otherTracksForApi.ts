import { buildOtherTracksForModel, type OtherTrackSnapshot } from '../../../../shared/otherTracks.ts';
import type { AiThreadState } from './aiThread';
import type { Mix } from '../ui/TrackMixer';
import type { SessionTrack, Snippet } from './snippets';

function clipCounts(clips: Snippet[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const clip of clips) {
    counts[clip.trackId] = (counts[clip.trackId] ?? 0) + 1;
  }
  return counts;
}

function lastPromptsByTrack(threads: AiThreadState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [trackId, turns] of Object.entries(threads)) {
    const last = turns[turns.length - 1];
    if (last?.prompt) {
      out[trackId] = last.prompt;
    }
  }
  return out;
}

export function otherTracksForGenerateApi(
  tracks: SessionTrack[],
  targetTrackId: string,
  clips: Snippet[],
  mixes: Record<string, Mix>,
  trackSources: Record<string, string>,
  aiThreads: AiThreadState,
): OtherTrackSnapshot[] {
  return buildOtherTracksForModel({
    tracks,
    targetTrackId,
    mixes,
    clipCountByTrackId: clipCounts(clips),
    trackSources,
    lastPromptByTrackId: lastPromptsByTrack(aiThreads),
  });
}
