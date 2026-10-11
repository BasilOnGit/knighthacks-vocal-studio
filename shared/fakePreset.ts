import { fillParams } from './params.ts';
import type { Preset, VoiceFeatures } from './types';

export const fakeFeatures: VoiceFeatures = {
  loudnessDb: -18,
  peakDb: -3,
  centroidHz: 2200,
  pitchHz: 180,
  noiseFloorDb: -48,
  voicedSeconds: 6.2,
  key: 0,
  scaleMajor: 1,
  keyConfidence: 0.85,
  pitchStability: 0.72,
  crestDb: 15,
  sibilanceRatio: 0.28,
  bpm: 120,
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
        attackMs: 10,
        releaseMs: 100,
        makeupDb: 0,
        kneeDb: 12,
        mix: 100,
      }),
      why: 'Soft knee Digi Comp–style leveling',
    },
    {
      id: 'reverb-1',
      type: 'reverb',
      enabled: true,
      params: fillParams('reverb', { mix: 12, sizePct: 17, tonePct: 18 }),
      why: 'Small dark room like BandLab Studio Reverb',
    },
  ],
};
