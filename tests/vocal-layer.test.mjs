import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferVocalLayerRole,
  promptRequestsWetSpace,
  vocalLayerHintsForModel,
} from '../shared/vocalLayer.ts';

test('inferVocalLayerRole from track name and prompt', () => {
  assert.equal(inferVocalLayerRole('warm pop', 'Adlibs'), 'adlib');
  assert.equal(inferVocalLayerRole('background vocal stack', 'Vocal'), 'background');
  assert.equal(inferVocalLayerRole('lead rap', 'Main'), 'unknown');
});

test('vocalLayerHintsForModel encourages wet BG and high reverb when asked', () => {
  const bg = vocalLayerHintsForModel('soft harmony', 'BG 1').join('\n');
  assert.match(bg, /background/i);
  assert.match(bg, /35–65|35-65/);

  const wet = vocalLayerHintsForModel('more reverb and lush space', 'Vocal').join('\n');
  assert.match(wet, /full catalog|0–100|0-100/i);
  assert.equal(promptRequestsWetSpace('heavy reverb dreamy'), true);
});
