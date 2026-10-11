import type { Mix } from '../ui/TrackMixer';
import type { SessionTrack, Snippet } from './snippets';

export const MAX_SESSION_UNDO = 20;

export type SessionUndoSnapshot = {
  clips: Snippet[];
  tracks: SessionTrack[];
  mixes: Record<string, Mix>;
  trackSources: Record<string, string>;
  selectedId: string | null;
  selectedTrackId: string | null;
  armedId: string;
};

export function captureSessionUndoSnapshot(state: SessionUndoSnapshot): SessionUndoSnapshot {
  return {
    clips: state.clips,
    tracks: state.tracks.map((track) => ({
      ...track,
      preset: structuredClone(track.preset),
    })),
    mixes: { ...state.mixes },
    trackSources: { ...state.trackSources },
    selectedId: state.selectedId,
    selectedTrackId: state.selectedTrackId,
    armedId: state.armedId,
  };
}
