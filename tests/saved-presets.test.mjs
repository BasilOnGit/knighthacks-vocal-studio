import test from 'node:test';
import assert from 'node:assert/strict';
import {
  presetForApply,
  snapshotPreset,
} from '../apps/web/src/session/savedPresets.ts';

test('presetForApply assigns fresh effect ids', () => {
  const saved = snapshotPreset({
    name: 'Test',
    explanation: 'Chain',
    chain: [
      {
        id: 'eq-1',
        type: 'eq',
        enabled: true,
        params: { lowCutHz: 90 },
      },
    ],
  });
  const applied = presetForApply(saved);
  assert.match(applied.chain[0].id, /^[0-9a-f-]{36}$/i);
  assert.equal(applied.chain[0].type, 'eq');
});
