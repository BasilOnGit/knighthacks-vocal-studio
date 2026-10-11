import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTimelineSec } from '../apps/web/src/session/timelineCoords.ts';

test('clampTimelineSec stays within timeline bounds', () => {
  assert.equal(clampTimelineSec(-1, 10), 0);
  assert.equal(clampTimelineSec(5, 10), 5);
  assert.equal(clampTimelineSec(12, 10), 10);
});
