import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSessionUndoSnapshot } from '../apps/web/src/session/sessionUndo.ts';
import { emptyTrackPreset } from '../apps/web/src/session/snippets.ts';

test('captureSessionUndoSnapshot clones track presets', () => {
  const tracks = [{ id: 'vocal', name: 'Vocal', preset: { ...emptyTrackPreset('Vocal'), name: 'A' } }];
  const snapshot = captureSessionUndoSnapshot({
    clips: [],
    tracks,
    mixes: { vocal: { db: 0, muted: false, solo: false } },
    trackSources: { vocal: 'manual' },
    selectedId: null,
    selectedTrackId: 'vocal',
    armedId: 'vocal',
  });
  snapshot.tracks[0].preset.name = 'B';
  assert.equal(tracks[0].preset.name, 'A');
});
