import assert from 'node:assert/strict';
import test from 'node:test';
import { eqMagnitudeDb } from '../apps/web/src/audio/eqCurve.ts';

test('flat EQ is near 0 dB at 1 kHz', () => {
  const db = eqMagnitudeDb(1000, {});
  assert.ok(Math.abs(db) < 1.5);
});

test('mid boost raises energy near body frequency', () => {
  const flat = eqMagnitudeDb(1000, { bodyDb: 0 });
  const boosted = eqMagnitudeDb(1000, { bodyDb: 6, bodyHz: 1000 });
  assert.ok(boosted > flat + 4);
});
