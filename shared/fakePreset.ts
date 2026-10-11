import { fillParams } from './params.ts';
import type { Preset, VoiceFeatures } from './types';

export const fakeFeatures: VoiceFeatures = {
  loudnessDb: -18,
  peakDb: -3,
  centroidHz: 2200,
  pitchHz: 180,
  noiseFloorDb: -48,
  voicedSeconds: 6.2,
};

export const fakePreset: Preset = {
  name: 'Warm and close',
  explanation:
    'Thin low end, a little air, gentle compression to keep it intimate.',
  chain: [
    {
      id: 'eq-1',
      type: 'eq',
      enabled: true,
      params: fillParams('eq', {
        lowCutHz: 95,
        lowShelfHz: 200,
        lowShelfDb: 1.5,
        bodyDb: -2.5,
        presenceDb: 2,
        airDb: 3.5,
      }),
      why: 'Clean low end, forward presence, gentle air',
    },
    {
      id: 'compressor-1',
      type: 'compressor',
      enabled: true,
      params: fillParams('compressor', {
        thresholdDb: -18,
        ratio: 3.2,
        attackMs: 5,
        releaseMs: 100,
        makeupDb: 3.5,
        kneeDb: 10,
        mix: 0.85,
      }),
      why: 'Soft knee with parallel blend for an even, close vocal',
    },
    {
      id: 'reverb-1',
      type: 'reverb',
      enabled: true,
      params: fillParams('reverb', { mix: 0.1, decaySec: 0.75, preDelayMs: 32 }),
      why: 'Short, filtered room — stays behind the vocal',
    },
  ],
};
