import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentToUnit,
  reverbSizeToDecaySec,
  decaySecToSizePct,
} from '../shared/bandlabScale.ts';
import { equalPowerMix, vocalSendMix } from '../apps/web/src/audio/autotuneSnap.ts';
import { deesserRatio } from '../apps/web/src/audio/vocalDeesser.ts';
import { vocalReverbLpfHz, vocalReverbSendLpfHz } from '../apps/web/src/audio/vocalReverb.ts';
import { VOCAL_DELAY_LPF_HZ } from '../apps/web/src/audio/vocalDelay.ts';
import { vocalPeakingQ, vocalShelfQ } from '../apps/web/src/audio/vocalEq.ts';
import { PARAM_RANGES } from '../shared/params.ts';
import { validatePreset } from '../shared/validate.ts';

test('deesser frequency matches BandLab (up to ~14 kHz)', () => {
  assert.equal(PARAM_RANGES.deesser.freqHz.default, 14000);
  assert.ok(PARAM_RANGES.deesser.freqHz.max >= 13997);
});

test('deesser amount is 0–100% in the UI', () => {
  assert.equal(PARAM_RANGES.deesser.mix.unit, 'percent');
  assert.equal(deesserRatio(percentToUnit(70)), deesserRatio(0.7));
});

test('reverb mix/size/tone use BandLab percent defaults', () => {
  assert.equal(PARAM_RANGES.reverb.mix.default, 41);
  assert.equal(PARAM_RANGES.reverb.sizePct.default, 17);
  assert.equal(PARAM_RANGES.reverb.tonePct.default, 18);
  assert.ok(Math.abs(reverbSizeToDecaySec(17) - 0.775) < 0.05);
});

test('legacy 0–1 mixes migrate to percent', () => {
  const preset = validatePreset({
    name: 'Old',
    explanation: 'x',
    chain: [{ type: 'reverb', params: { mix: 0.41, decaySec: 0.75 } }],
  });
  assert.equal(preset.chain[0].params.mix, 41);
  assert.ok(preset.chain[0].params.sizePct > 0);
});

test('reverb and delay wet level keep the dry vocal up', () => {
  const send = vocalSendMix(percentToUnit(41));
  const equal = equalPowerMix(percentToUnit(41));
  assert.ok(Math.abs(send.wet - 0.41) < 0.001);
  assert.ok(send.dry > equal.dry);
});

test('short rooms are darker than long halls', () => {
  const short = vocalReverbLpfHz(reverbSizeToDecaySec(17), 18);
  const long = vocalReverbLpfHz(reverbSizeToDecaySec(80), 18);
  assert.ok(short < long);
  assert.ok(vocalReverbSendLpfHz(reverbSizeToDecaySec(17), 18) > short);
});

test('delay feedback default matches BandLab 15%', () => {
  assert.equal(PARAM_RANGES.delay.feedback.default, 15);
  assert.ok(VOCAL_DELAY_LPF_HZ <= 5500);
});

test('EQ3-style primary bands are Low / Mid / High', () => {
  assert.equal(PARAM_RANGES.eq.lowShelfDb.unit, 'db');
  assert.equal(PARAM_RANGES.eq.bodyDb.default, 0);
  assert.equal(PARAM_RANGES.compressor.mix.default, 100);
});

test('decaySec migrates to size percent and back', () => {
  const pct = decaySecToSizePct(0.775);
  assert.ok(Math.abs(pct - 17) < 2);
});

test('delay ping-pong param defaults to off', () => {
  assert.equal(PARAM_RANGES.delay.pingPong.default, 0);
});

test('rider max gain param caps boost range', () => {
  assert.equal(PARAM_RANGES.rider.maxGainDb.max, 12);
});
