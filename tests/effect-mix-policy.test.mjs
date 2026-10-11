import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAutotuneMixParams } from '../shared/effectMixPolicy.ts';
import { validatePreset } from '../shared/validate.ts';

test('normalizeAutotuneMixParams maps partial mix into retune and forces mix 100', () => {
  const out = normalizeAutotuneMixParams({
    mix: 50,
    retuneSpeed: 0.9,
    snap: 0.85,
    speed: 0.8,
    key: 0,
    scaleMajor: 1,
  });
  assert.equal(out.mix, 100);
  assert.ok(out.retuneSpeed < 0.9);
  assert.ok(Math.abs(out.retuneSpeed - 0.45) < 0.001);
  assert.ok(out.snap < 0.85);
});

test('validatePreset applies autotune mix policy', () => {
  const preset = validatePreset({
    name: 'Test',
    explanation: 'x',
    chain: [
      {
        type: 'autotune',
        params: { mix: 40, retuneSpeed: 1, snap: 1, key: 0, scaleMajor: 1 },
      },
    ],
  });
  const tune = preset.chain[0];
  assert.equal(tune.params.mix, 100);
  assert.ok(tune.params.retuneSpeed < 0.5);
});
