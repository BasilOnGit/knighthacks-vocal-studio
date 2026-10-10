import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrompt, validateFeatures, generatePreset } from '../src/preset.js';
import { fakeFeatures } from '../../../shared/fakePreset.ts';
import { validatePreset } from '../../../shared/validate.ts';

test('accepts trimmed descriptions', () => assert.equal(validatePrompt({ prompt: ' R&B ' }), 'R&B'));
test('rejects malformed and oversized prompts', () => {
  for (const body of [null, {}, { prompt: 3 }, { prompt: '  ' }, { prompt: 'a'.repeat(1001) }]) {
    assert.throws(() => validatePrompt(body));
  }
});

test('requires six finite voice measurements', () => {
  assert.deepEqual(validateFeatures(fakeFeatures), fakeFeatures);
  for (const features of [
    null,
    {},
    { ...fakeFeatures, pitchHz: '180' },
    { ...fakeFeatures, loudnessDb: Number.NaN },
    { ...fakeFeatures, centroidHz: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(() => validateFeatures(features));
  }
});

test('generatePreset returns the Warm and close fallback', async () => {
  const result = await generatePreset('warm intimate vocals', fakeFeatures);
  assert.equal(result.source, 'fallback');
  assert.equal(result.preset.name, 'Warm and close');
  assert.deepEqual(
    result.preset.chain.map((node) => node.type),
    ['eq', 'compressor', 'reverb'],
  );
});

test('clamps params that are out of range', () => {
  const preset = validatePreset({
    name: 'Loud',
    explanation: 'Too much air',
    chain: [{ type: 'eq', params: { lowCutHz: 9999, highShelfDb: -100 } }],
  });
  assert.equal(preset.chain.length, 1);
  assert.equal(preset.chain[0].params.lowCutHz, 300);
  assert.equal(preset.chain[0].params.highShelfDb, -6);
});

test('drops unknown effect types', () => {
  const preset = validatePreset({
    name: 'Odd',
    explanation: 'Unknown gear',
    chain: [
      { type: 'autotune', params: { amount: 1 } },
      { type: 'reverb', params: { mix: 0.2 } },
    ],
  });
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['reverb'],
  );
});

test('keeps the first node of a duplicate type', () => {
  const preset = validatePreset({
    name: 'Echo',
    explanation: 'Two delays',
    chain: [
      { type: 'delay', id: 'delay-a', enabled: false, params: { timeMs: 200 } },
      { type: 'delay', id: 'delay-b', params: { timeMs: 500 } },
    ],
  });
  assert.equal(preset.chain.length, 1);
  assert.equal(preset.chain[0].id, 'delay-a');
  assert.equal(preset.chain[0].enabled, false);
  assert.equal(preset.chain[0].params.timeMs, 200);
});

test('fills missing params and assigns a stable id', () => {
  const preset = validatePreset({
    name: 'Quiet',
    explanation: 'Defaults',
    chain: [{ type: 'eq', params: { lowCutHz: 90 } }],
  });
  assert.equal(preset.chain[0].id, 'eq-1');
  assert.equal(preset.chain[0].enabled, true);
  assert.equal(preset.chain[0].params.lowCutHz, 90);
  assert.equal(preset.chain[0].params.lowShelfDb, 0);
  assert.equal(preset.chain[0].params.presenceDb, 0);
  assert.equal(preset.chain[0].params.highShelfDb, 0);
});

test('sorts the chain into FIXED_ORDER', () => {
  const preset = validatePreset({
    name: 'Wide',
    explanation: 'Space',
    chain: [
      { type: 'reverb', params: {} },
      { type: 'eq', params: {} },
      { type: 'delay', params: {} },
    ],
  });
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['eq', 'delay', 'reverb'],
  );
});

test('caps the chain at five effects', () => {
  const preset = validatePreset({
    name: 'Full',
    explanation: 'Everything',
    chain: [
      { type: 'reverb', params: {} },
      { type: 'delay', params: {} },
      { type: 'chorus', params: {} },
      { type: 'saturation', params: {} },
      { type: 'compressor', params: {} },
      { type: 'eq', params: {} },
    ],
  });
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['compressor', 'saturation', 'chorus', 'delay', 'reverb'],
  );
});

test('throws when the preset shape is invalid', () => {
  assert.throws(() => validatePreset(null));
  assert.throws(() => validatePreset({ name: 1, explanation: 'Y', chain: [] }));
  assert.throws(() =>
    validatePreset({
      name: 'X',
      explanation: 'Y',
      chain: [{ type: 'eq', params: { lowCutHz: 'hot' } }],
    }),
  );
});
