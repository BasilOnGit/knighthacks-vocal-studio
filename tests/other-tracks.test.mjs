import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtherTracksForModel } from '../shared/otherTracks.ts';
import { emptyTrackPreset } from '../apps/web/src/session/snippets.ts';
import { validatePreset } from '../shared/validate.ts';

test('buildOtherTracksForModel excludes target and empty tracks', () => {
  const tracks = [
    { id: 'beat', name: 'Beat', preset: emptyTrackPreset('Beat') },
    {
      id: 'vocal',
      name: 'Lead',
      preset: validatePreset({
        name: 'Lead',
        explanation: 'Pop',
        chain: [{ type: 'eq', params: { lowCutHz: 90 } }],
      }),
    },
    { id: 'bg1', name: 'BG 1', preset: emptyTrackPreset('BG 1') },
  ];
  const out = buildOtherTracksForModel({
    tracks,
    targetTrackId: 'bg1',
    mixes: { vocal: { db: -2 } },
    clipCountByTrackId: { beat: 1, vocal: 2, bg1: 1 },
    lastPromptByTrackId: { vocal: 'dream pop airy' },
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Beat');
  assert.equal(out[0].role, 'beat');
  assert.equal(out[1].name, 'Lead');
  assert.equal(out[1].trackVolumeDb, -2);
  assert.equal(out[1].lastPrompt, 'dream pop airy');
  assert.equal(out[1].chain.length, 1);
});
