import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_SESSION_KEY,
  bufferStorageKey,
  sessionStorageKey,
} from '../apps/web/src/session/studioProjects.ts';

test('session and buffer keys are scoped per project', () => {
  const id = 'abc-123';
  assert.equal(sessionStorageKey(id), 'vocal-studio.session.v1.abc-123');
  assert.equal(bufferStorageKey(id, 'clip-1'), 'abc-123:clip-1');
  assert.equal(LEGACY_SESSION_KEY, 'vocal-studio.session.v1');
});
