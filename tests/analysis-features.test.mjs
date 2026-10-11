import test from 'node:test';
import assert from 'node:assert/strict';
import { bestKeyFromHistogram, detectKey } from '../apps/web/src/analysis/detectKey.ts';
import { detectBpmFromMono } from '../apps/web/src/analysis/detectBpm.ts';
import {
  snapDelayTimeMs,
  stampPresetFromFeatures,
  KEY_STAMP_MIN_CONFIDENCE,
} from '../shared/stampPreset.ts';
import { fakeFeatures } from '../shared/fakePreset.ts';

function mockBuffer(mono, sampleRate = 44100) {
  return {
    sampleRate,
    length: mono.length,
    numberOfChannels: 1,
    duration: mono.length / sampleRate,
    getChannelData: () => mono,
  };
}

function synthTone(freqHz, durationSec, sampleRate) {
  const length = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = 0.45 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

function concatChunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

test('Krumhansl scoring picks C major from a C-major pitch-class histogram', () => {
  const histogram = [12, 0, 0, 0, 9, 0, 0, 8, 0, 0, 0, 0];
  const result = bestKeyFromHistogram(histogram);
  assert.equal(result.key, 0);
  assert.equal(result.scaleMajor, 1);
  assert.ok(result.keyConfidence > 0);
});

test('detectKey finds C major on a sine arpeggio', () => {
  const sampleRate = 44100;
  const scale = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
  const chunks = [];
  for (let pass = 0; pass < 3; pass++) {
    for (const hz of scale) {
      chunks.push(synthTone(hz, 0.35, sampleRate));
    }
  }
  const mono = concatChunks(chunks);
  const buffer = mockBuffer(mono, sampleRate);
  const result = detectKey(buffer, 0, buffer.duration);
  assert.equal(result.key, 0);
  assert.equal(result.scaleMajor, 1);
  assert.ok(result.keyConfidence > 0.1);
});

test('detectBpmFromMono estimates tempo from a click track', () => {
  const sampleRate = 44100;
  const bpm = 120;
  const beatSec = 60 / bpm;
  const durationSec = 8;
  const length = Math.floor(durationSec * sampleRate);
  const mono = new Float32Array(length);
  for (let beat = 0; beat * beatSec < durationSec; beat++) {
    const start = Math.floor(beat * beatSec * sampleRate);
    for (let i = 0; i < 400 && start + i < length; i++) {
      mono[start + i] = 0.9 * Math.exp(-i / 30) * Math.sin((2 * Math.PI * 1200 * i) / sampleRate);
    }
  }
  const detected = detectBpmFromMono(mono, sampleRate);
  assert.ok(Math.abs(detected - bpm) <= 3, `expected ~${bpm}, got ${detected}`);
});

test('snapDelayTimeMs picks the nearest musical subdivision', () => {
  assert.equal(snapDelayTimeMs(260, 120), 250);
  assert.equal(snapDelayTimeMs(380, 120), 375);
  assert.equal(snapDelayTimeMs(520, 120), 500);
});

test('stampPresetFromFeatures writes key and snaps delay when confident', () => {
  const features = {
    ...fakeFeatures,
    key: 7,
    scaleMajor: 0,
    keyConfidence: KEY_STAMP_MIN_CONFIDENCE + 0.1,
    bpm: 120,
  };
  const preset = stampPresetFromFeatures(
    {
      name: 'Test',
      explanation: 'Test',
      chain: [
        {
          id: 'autotune-1',
          type: 'autotune',
          enabled: true,
          params: { mix: 50, key: 0, scaleMajor: 1 },
        },
        {
          id: 'delay-1',
          type: 'delay',
          enabled: true,
          params: { timeMs: 260, feedback: 15, mix: 20, pingPong: 0 },
        },
      ],
    },
    features,
  );
  assert.equal(preset.chain[0].params.key, 7);
  assert.equal(preset.chain[0].params.scaleMajor, 0);
  assert.equal(preset.chain[1].params.timeMs, 250);
});
