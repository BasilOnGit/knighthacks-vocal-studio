import { clipTimelineStartSec } from './clip.ts';
import type { Snippet } from './snippets.ts';

/** Clip whose audio features power AI / autotune defaults for a track. */
export function featureClipForTrack(
  clips: Snippet[],
  trackId: string,
  preferredClipId: string | null,
): Snippet | null {
  const onTrack = clips.filter((c) => c.trackId === trackId);
  if (onTrack.length === 0) return null;
  if (preferredClipId) {
    const preferred = onTrack.find((c) => c.id === preferredClipId);
    if (preferred) return preferred;
  }
  return onTrack.reduce((earliest, clip) =>
    clipTimelineStartSec(clip) < clipTimelineStartSec(earliest) ? clip : earliest,
  );
}
