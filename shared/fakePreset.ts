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
      params: fillParams('eq', { lowCutHz: 90, airDb: 3 }),
      why: 'Remove rumble, add air',
    },
    {
      id: 'compressor-1',
      type: 'compressor',
      enabled: true,
      params: fillParams('compressor', { thresholdDb: -20, ratio: 3 }),
      why: 'Keep the level even and close',
    },
    {
      id: 'reverb-1',
      type: 'reverb',
      enabled: true,
      params: fillParams('reverb', { mix: 0.12, decaySec: 0.9 }),
      why: 'A small room, not a hall',
    },
  ],
};
