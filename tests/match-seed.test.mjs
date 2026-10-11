import assert from 'node:assert/strict';
import test from 'node:test';
import { matchSeed, SEED_SPECS, seedSpecById } from '../shared/matchSeed.ts';
import { validatePreset } from '../shared/validate.ts';

const CASES = [
  { prompt: 'please denoise my vocal', id: 'noise-cleanup', mustInclude: ['denoise'] },
  { prompt: 'podcast interview clean', id: 'podcast', mustInclude: ['rider'] },
  { prompt: 'telephone effect on verse', id: 'telephone', mustInclude: ['eq'] },
  { prompt: 'hyperpop glitch vocal', id: 'hyperpop', mustInclude: ['autotune', 'saturation'] },
  { prompt: 'heavy trap autotune vocal', id: 'trap', mustInclude: ['autotune'] },
  { prompt: 'uk drill dark vocal', id: 'drill', mustInclude: ['autotune'] },
  { prompt: 'metal scream vocal', id: 'metal', mustInclude: ['gate'] },
  { prompt: 'raw jazz vocal natural', id: 'natural', mustExclude: ['reverb', 'delay'] },
  { prompt: 'dreamy ethereal billie', id: 'dream-pop', mustInclude: ['reverb', 'delay'] },
  { prompt: 'lo-fi joji bedroom', id: 'lo-fi', mustInclude: ['saturation'] },
  { prompt: 'gospel worship vocal', id: 'worship', mustInclude: ['reverb', 'doubler'] },
  { prompt: '80s synth pop chorus', id: 'synth-80s', mustInclude: ['chorus'] },
  { prompt: 'arena anthem stadium', id: 'anthem', mustInclude: ['reverb'] },
  { prompt: 'house edm club vocal', id: 'edm', mustInclude: ['compressor'] },
  { prompt: 'pop punk rock vocal', id: 'rock', mustInclude: ['saturation'] },
  { prompt: 'nashville country vocal', id: 'country', mustInclude: ['reverb'] },
  { prompt: 'boom bap hip hop rap', id: 'hip-hop', mustExclude: ['autotune'] },
  { prompt: 'airy pop radio top 40', id: 'airy-pop', mustInclude: ['deesser'] },
  { prompt: 'indie folk acoustic fragile', id: 'indie-folk', mustInclude: ['reverb'] },
  { prompt: 'warm intimate R&B soul', id: 'warm-rnb', mustInclude: ['rider'] },
  { prompt: 'make my vocal sound good', fallback: true, name: /balanced|pop/i, mustInclude: ['compressor', 'deesser'] },
];

test('SEED_SPECS covers every documented style id uniquely', () => {
  const ids = SEED_SPECS.map((spec) => spec.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 18);
});

test('matchSeed maps prompts to expected library entries', () => {
  for (const { prompt, id, fallback, name, mustInclude = [], mustExclude = [] } of CASES) {
    const preset = validatePreset(matchSeed(prompt));
    if (fallback) {
      if (name) {
        assert.match(preset.name, name, prompt);
      }
    } else {
      const spec = seedSpecById(id);
      assert.ok(spec, `missing spec ${id}`);
      assert.equal(spec.match.test(prompt.normalize('NFKC').toLowerCase()), true, prompt);
    }
    const types = preset.chain.map((node) => node.type);
    for (const type of mustInclude) {
      assert.ok(types.includes(type), `${prompt} should include ${type}, got ${types.join(',')}`);
    }
    for (const type of mustExclude) {
      assert.ok(!types.includes(type), `${prompt} should not include ${type}`);
    }
  }
});

test('every seed builder validates', () => {
  for (const spec of SEED_SPECS) {
    const preset = validatePreset(spec.build());
    assert.ok(preset.chain.length > 0, spec.id);
    assert.ok(preset.name.length > 0, spec.id);
  }
  validatePreset(matchSeed('generic vocal'));
});
