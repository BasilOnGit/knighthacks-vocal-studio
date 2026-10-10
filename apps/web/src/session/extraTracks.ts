export const MAX_SESSION_LANES = 6;
const FIRST_EXTRA_LANE = 3;

import type { SessionAudioClip } from './clip';

export type ExtraTrack = {
  id: string;
  laneNumber: number;
  clip: SessionAudioClip | null;
};

export function nextExtraLaneNumber(tracks: ExtraTrack[]): number | null {
  const used = new Set(tracks.map((t) => t.laneNumber));
  for (let n = FIRST_EXTRA_LANE; n <= MAX_SESSION_LANES; n++) {
    if (!used.has(n)) {
      return n;
    }
  }
  return null;
}

export function createExtraTrack(tracks: ExtraTrack[]): ExtraTrack | null {
  const laneNumber = nextExtraLaneNumber(tracks);
  if (laneNumber == null) {
    return null;
  }
  return { id: crypto.randomUUID(), laneNumber, clip: null };
}

export function sessionLaneCount(extraTracks: ExtraTrack[]): number {
  return 2 + extraTracks.length;
}

export function canAddSessionLane(extraTracks: ExtraTrack[]): boolean {
  return sessionLaneCount(extraTracks) < MAX_SESSION_LANES;
}

export function sortExtraTracks(tracks: ExtraTrack[]): ExtraTrack[] {
  return [...tracks].sort((a, b) => a.laneNumber - b.laneNumber);
}
