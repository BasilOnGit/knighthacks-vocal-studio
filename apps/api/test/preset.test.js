import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePrompt,
  validateFeatures,
  generatePreset,
  ensureMixProtocol,
  promptRejectsSpace,
  validateCurrentTrackVolume,
} from '../src/preset.js';
import { fakeFeatures } from '../../../shared/fakePreset.ts';
import { validatePreset } from '../../../shared/validate.ts';

test('accepts trimmed descriptions', () => assert.equal(validatePrompt({ prompt: ' R&B ' }), 'R&B'));
test('rejects malformed and oversized prompts', () => {
  for (const body of [null, {}, { prompt: 3 }, { prompt: '  ' }, { prompt: 'a'.repeat(1001) }]) {
    assert.throws(() => validatePrompt(body));
  }
});

test('requires finite voice measurements', () => {
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
  assert.match(result.preset.name, /warm|r&b/i);
  assert.ok(result.preset.chain.length > 0);
  assert.equal(typeof result.preset.trackVolumeDb, 'number');
  assert.ok(result.preset.trackVolumeDb <= 0);
});

test('validateCurrentTrackVolume clamps and rejects bad values', () => {
  assert.equal(validateCurrentTrackVolume({}), undefined);
  assert.equal(validateCurrentTrackVolume({ currentTrackVolumeDb: 3 }), 3);
  assert.equal(validateCurrentTrackVolume({ currentTrackVolumeDb: 99 }), 6);
  assert.throws(() => validateCurrentTrackVolume({ currentTrackVolumeDb: 'loud' }));
});

test('generatePreset keeps current fader on follow-up when model omits trackVolumeDb', async () => {
  const modelPreset = {
    name: 'Tweak',
    explanation: 'More air',
    chain: [{ type: 'eq', params: { airDb: 4 }, why: 'Brighter' }],
  };
  const result = await generatePreset(
    'a bit brighter',
    fakeFeatures,
    {
      ...modelOptions(async () => jsonResponse(JSON.stringify(modelPreset))),
      currentTrackVolumeDb: 2.5,
    },
  );
  assert.equal(result.source, 'model');
  assert.equal(result.preset.trackVolumeDb, 2.5);
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
      assert.match(body.messages[0].content, /gate: thresholdDb -80 to 0/);
      assert.match(body.messages[0].content, /denoise: amount 0 to 100/);
      assert.match(body.messages[0].content, /denoise — place first when used/);
      assert.match(body.messages[0].content, /deesser:.*freqHz 4000 to 16000/);
      assert.match(body.messages[1].content, /dreamy spacious vocals/);
      return jsonResponse(`\`\`\`json\n${JSON.stringify(dreamyPreset)}\n\`\`\``);
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.source, 'model');
  assert.equal(result.preset.name, 'Dreamy');
  assert.deepEqual(
    result.preset.chain.map((node) => node.type),
    ['reverb', 'delay', 'eq'],
  );
  assert.equal(result.preset.chain[0].params.mix, 40);
  assert.equal(result.preset.chain[0].params.sizePct, 100);
  assert.equal(result.preset.chain[0].params.tonePct, 18);
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
  assert.match(result.preset.name, /warm|r&b/i);
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
  assert.match(result.preset.name, /warm|r&b/i);
});

test('clamps params that are out of range', () => {
  const preset = validatePreset({
    name: 'Loud',
    explanation: 'Too much air',
    chain: [{ type: 'eq', params: { lowCutHz: 9999, airDb: -100 } }],
  });
  assert.equal(preset.chain.length, 1);
  assert.equal(preset.chain[0].params.lowCutHz, 400);
  assert.equal(preset.chain[0].params.airDb, -12);
});

test('accepts autotune in the chain', () => {
  const preset = validatePreset({
    name: 'Trap',
    explanation: 'Tuned vocal',
    chain: [{ type: 'autotune', params: { mix: 0.8, speed: 0.9 } }],
  });
  assert.equal(preset.chain[0].type, 'autotune');
  assert.equal(preset.chain[0].params.mix, 80);
  assert.equal(preset.chain[0].params.snap, 0.85);
});

test('drops unknown effect types', () => {
  const preset = validatePreset({
    name: 'Odd',
    explanation: 'Unknown gear',
    chain: [
      { type: 'flanger', params: { amount: 1 } },
      { type: 'reverb', params: { mix: 0.2 } },
    ],
  });
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['reverb'],
  );
});

test('keeps duplicate effect types with sequential ids', () => {
  const preset = validatePreset({
    name: 'Echo',
    explanation: 'Two delays',
    chain: [
      { type: 'delay', enabled: false, params: { timeMs: 200 } },
      { type: 'delay', params: { timeMs: 500 } },
    ],
  });
  assert.equal(preset.chain.length, 2);
  assert.equal(preset.chain[0].id, 'delay-1');
  assert.equal(preset.chain[1].id, 'delay-2');
  assert.equal(preset.chain[0].enabled, false);
  assert.equal(preset.chain[0].params.timeMs, 200);
  assert.equal(preset.chain[1].params.timeMs, 500);
});

test('keeps two eq nodes in model order', () => {
  const preset = validatePreset({
    name: 'Polish',
    explanation: 'Cut then boost',
    chain: [
      { type: 'eq', params: { lowCutHz: 100, bodyDb: -3 } },
      { type: 'compressor', params: { ratio: 3 } },
      { type: 'eq', params: { presenceDb: 2 } },
    ],
  });
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['eq', 'compressor', 'eq'],
  );
  assert.equal(preset.chain[0].id, 'eq-1');
  assert.equal(preset.chain[2].id, 'eq-2');
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
  assert.equal(preset.chain[0].params.lowShelfHz, 180);
  assert.equal(preset.chain[0].params.bodyDb, 0);
  assert.equal(preset.chain[0].params.presenceDb, 0);
  assert.equal(preset.chain[0].params.airDb, 0);
});

test('preserves model chain order', () => {
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
    ['reverb', 'eq', 'delay'],
  );
});

test('caps the chain at twelve effects', () => {
  const preset = validatePreset({
    name: 'Full',
    explanation: 'Everything',
    chain: Array.from({ length: 13 }, (_, index) => ({
      type: 'eq',
      params: { lowCutHz: 80 + index },
    })),
  });
  assert.equal(preset.chain.length, 12);
  assert.equal(preset.chain[0].params.lowCutHz, 80);
  assert.equal(preset.chain[11].params.lowCutHz, 91);
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

test('promptRejectsSpace detects dry requests', () => {
  assert.equal(promptRejectsSpace('dry vocal, no reverb'), true);
  assert.equal(promptRejectsSpace('dreamy spacious vocals'), false);
});

test('ensureMixProtocol appends eq when missing and never adds reverb', () => {
  const preset = ensureMixProtocol(
    validatePreset({
      name: 'Bare',
      explanation: 'Only compression',
      chain: [{ type: 'compressor', params: { ratio: 3 } }],
    }),
  );
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['compressor', 'eq'],
  );
});

test('ensureMixProtocol leaves model order when eq already exists', () => {
  const preset = ensureMixProtocol(
    validatePreset({
      name: 'Trap',
      explanation: 'Tuned lead',
      chain: [
        { type: 'gate', params: { thresholdDb: -40 } },
        { type: 'autotune', params: { mix: 85 } },
        { type: 'eq', params: { lowCutHz: 100 } },
        { type: 'compressor', params: { ratio: 5 } },
      ],
    }),
  );
  assert.deepEqual(
    preset.chain.map((node) => node.type),
    ['gate', 'autotune', 'eq', 'compressor'],
  );
});

test('matchSeed returns trap tuning for trap prompts', async () => {
  const { matchSeed, SEED_SPECS } = await import('../../../shared/matchSeed.ts');
  assert.ok(SEED_SPECS.length >= 18);
  const trap = matchSeed('heavy trap autotune vocal');
  assert.ok(trap.chain.some((node) => node.type === 'autotune'));
  assert.ok(trap.chain[0].type === 'autotune' || trap.name.toLowerCase().includes('trap'));
  const warm = matchSeed('warm intimate R&B');
  assert.match(warm.name, /warm|r&b/i);
  assert.notEqual(trap.name, warm.name);
  const clean = matchSeed('please denoise my vocal');
  assert.ok(clean.chain.some((node) => node.type === 'denoise'));
  assert.equal(clean.chain[0].type, 'denoise');
  const generic = matchSeed('vocal');
  assert.match(generic.name, /balanced|pop/i);
});
