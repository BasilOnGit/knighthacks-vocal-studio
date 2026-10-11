import assert from 'node:assert/strict';
import test from 'node:test';
import { featureClipForTrack } from '../apps/web/src/session/featureClipForTrack.ts';
import { newSnippet } from '../apps/web/src/session/snippets.ts';

function fakeBuffer() {
  return { duration: 1, sampleRate: 48000, length: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
}

test('featureClipForTrack prefers selected clip on track', () => {
  const a = newSnippet(fakeBuffer(), 'A', 'vocal', 2);
  const b = newSnippet(fakeBuffer(), 'B', 'vocal', 0);
  const clip = featureClipForTrack([a, b], 'vocal', a.id);
  assert.equal(clip?.id, a.id);
});

test('featureClipForTrack picks earliest clip when no preference', () => {
  const a = newSnippet(fakeBuffer(), 'A', 'vocal', 2);
  const b = newSnippet(fakeBuffer(), 'B', 'vocal', 0);
  const clip = featureClipForTrack([a, b], 'vocal', null);
  assert.equal(clip?.id, b.id);
});
