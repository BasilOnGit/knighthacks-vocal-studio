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

const dreamyPreset = {
  name: 'Dreamy',
  explanation: 'A wide room around the vocal.',
  chain: [
    { type: 'reverb', params: { mix: 0.4, decaySec: 3.5 }, why: 'A long room' },
    { type: 'delay', params: { timeMs: 400, mix: 0.2 }, why: 'A soft repeat' },
  ],
};

function jsonResponse(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function modelOptions(fetchImpl) {
  return {
    token: 'test-token',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    fetch: fetchImpl,
  };
}

test('generatePreset returns the fallback without calling the model when credentials are missing', async () => {
  let calls = 0;
  const result = await generatePreset('warm intimate vocals', fakeFeatures, {
    token: '',
    model: '',
    fetch: () => {
      calls += 1;
      throw new Error('fetch should not run');
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.source, 'fallback');
  assert.equal(result.preset.name, 'Warm and close');
  assert.deepEqual(
    result.preset.chain.map((node) => node.type),
    ['eq', 'compressor', 'reverb'],
  );
});

test('generatePreset returns a validated model preset', async () => {
  let calls = 0;
  const result = await generatePreset(
    'dreamy spacious vocals',
    fakeFeatures,
    modelOptions(async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'Qwen/Qwen2.5-7B-Instruct');
      assert.equal(body.response_format.type, 'json_object');
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      assert.match(body.messages[0].content, /reverb: decaySec 0\.3 to 5/);
      assert.match(body.messages[1].content, /dreamy spacious vocals/);
      return jsonResponse(`\`\`\`json\n${JSON.stringify(dreamyPreset)}\n\`\`\``);
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.source, 'model');
  assert.equal(result.preset.name, 'Dreamy');
  assert.deepEqual(
    result.preset.chain.map((node) => node.type),
    ['delay', 'reverb'],
  );
  assert.equal(result.preset.chain[1].params.mix, 0.4);
  assert.equal(result.preset.chain[1].params.preDelayMs, 20);
});

test('generatePreset retries once after invalid JSON', async () => {
  let calls = 0;
  const result = await generatePreset(
    'dreamy spacious vocals',
    fakeFeatures,
    modelOptions(async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      if (calls === 1) {
        return jsonResponse('not json');
      }
      assert.match(body.messages[1].content, /previous output failed validation/i);
      return jsonResponse(JSON.stringify(dreamyPreset));
    }),
  );
  assert.equal(calls, 2);
  assert.equal(result.source, 'model');
  assert.equal(result.preset.name, 'Dreamy');
});

test('generatePreset falls back after two invalid outputs', async () => {
  let calls = 0;
  const result = await generatePreset(
    'warm intimate vocals',
    fakeFeatures,
    modelOptions(async () => {
      calls += 1;
      return jsonResponse('{');
    }),
  );
  assert.equal(calls, 2);
  assert.equal(result.source, 'fallback');
  assert.equal(result.preset.name, 'Warm and close');
});

test('generatePreset falls back when the model request throws', async () => {
  let calls = 0;
  const result = await generatePreset(
    'warm intimate vocals',
    fakeFeatures,
    modelOptions(async () => {
      calls += 1;
      throw new Error('network down');
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.source, 'fallback');
  assert.equal(result.preset.name, 'Warm and close');
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
