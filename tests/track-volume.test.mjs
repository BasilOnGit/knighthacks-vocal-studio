import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_VOLUME_DB_MIN,
  TRACK_VOLUME_DB_MAX,
  clampTrackVolumeDb,
  suggestTrackVolumeDb,
  resolveTrackVolumeDb,
  withResolvedTrackVolume,
} from '../shared/trackVolume.ts';
import { fakeFeatures } from '../shared/fakePreset.ts';

test('clampTrackVolumeDb respects mixer range', () => {
  assert.equal(clampTrackVolumeDb(-99), TRACK_VOLUME_DB_MIN);
  assert.equal(clampTrackVolumeDb(99), TRACK_VOLUME_DB_MAX);
  assert.equal(clampTrackVolumeDb(2.5), 2.5);
  assert.equal(clampTrackVolumeDb(Number.NaN), 0);
});

test('suggestTrackVolumeDb nudges from prompt and loudness', () => {
  const quiet = suggestTrackVolumeDb('whisper intimate vocal', { ...fakeFeatures, loudnessDb: -30 });
  assert.ok(quiet <= -2);
  const loud = suggestTrackVolumeDb('stadium anthem belt', { ...fakeFeatures, crestDb: 10 });
  assert.ok(loud >= 2);
});

test('resolveTrackVolumeDb prefers preset, then current fader, then suggest', () => {
  const preset = { name: 'X', explanation: 'Y', chain: [], trackVolumeDb: 4 };
  assert.equal(resolveTrackVolumeDb(preset, 'vocal', fakeFeatures), 4);
  assert.equal(
    resolveTrackVolumeDb({ name: 'X', explanation: 'Y', chain: [] }, 'vocal', fakeFeatures, 1.5),
    1.5,
  );
  const suggested = resolveTrackVolumeDb({ name: 'X', explanation: 'Y', chain: [] }, 'podcast', fakeFeatures);
  assert.ok(suggested <= 0);
});

test('withResolvedTrackVolume stamps trackVolumeDb on preset', () => {
  const out = withResolvedTrackVolume(
    { name: 'A', explanation: 'B', chain: [] },
    'trap vocal',
    fakeFeatures,
  );
  assert.equal(typeof out.trackVolumeDb, 'number');
});
