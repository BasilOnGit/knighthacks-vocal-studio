import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAiEffectWhy } from '../apps/web/src/session/aiEffectWhy.ts';

const features = {
  loudnessDb: -21.3,
  peakDb: -8,
  centroidHz: 2400,
  pitchHz: 220,
  noiseFloorDb: -50,
  voicedSeconds: 3,
  key: 0,
  scaleMajor: 1,
  keyConfidence: 0.8,
  pitchStability: 0.7,
  crestDb: 12,
  sibilanceRatio: 0.2,
  bpm: 120,
};

test('formatAiEffectWhy prefixes avg level for AI effect copy', () => {
  const out = formatAiEffectWhy(
    'Clean up residual noise while preserving vocal texture.',
    features,
  );
  assert.equal(
    out,
    'Based on sound input (avg level: -21.3 dB), use to clean up residual noise while preserving vocal texture.',
  );
});

test('formatAiEffectWhy does not double-prefix', () => {
  const already = 'Based on sound input (avg level: -20.0 dB), use to tame hiss.';
  assert.equal(formatAiEffectWhy(already, features), already);
});
