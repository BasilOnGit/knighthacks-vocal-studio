import type { EffectType } from './types';

export const MAX_EFFECTS = 5;

export const FIXED_ORDER: readonly EffectType[] = [
  'eq',
  'compressor',
  'saturation',
  'chorus',
  'delay',
  'reverb',
] as const;

export interface ParamRange {
  min: number;
  max: number;
  default: number;
}

export const PARAM_RANGES = {
  eq: {
    lowCutHz: { min: 20, max: 300, default: 80 },
    lowShelfDb: { min: -6, max: 6, default: 0 },
    presenceDb: { min: -6, max: 6, default: 0 },
    highShelfDb: { min: -6, max: 8, default: 0 },
  },
  compressor: {
    thresholdDb: { min: -40, max: 0, default: -20 },
    ratio: { min: 1, max: 10, default: 3 },
    attackMs: { min: 1, max: 50, default: 15 },
    releaseMs: { min: 50, max: 500, default: 100 },
    makeupDb: { min: 0, max: 12, default: 0 },
  },
  saturation: {
    drive: { min: 0, max: 1, default: 0 },
    mix: { min: 0, max: 0.5, default: 0 },
  },
  chorus: {
    rateHz: { min: 0.5, max: 4, default: 1.5 },
    depth: { min: 0, max: 1, default: 0.3 },
    mix: { min: 0, max: 0.5, default: 0 },
  },
  delay: {
    timeMs: { min: 50, max: 800, default: 400 },
    feedback: { min: 0, max: 0.6, default: 0.2 },
    mix: { min: 0, max: 0.5, default: 0 },
  },
  reverb: {
    decaySec: { min: 0.3, max: 5, default: 0.9 },
    preDelayMs: { min: 0, max: 100, default: 20 },
    mix: { min: 0, max: 0.6, default: 0.12 },
  },
} as const satisfies Record<EffectType, Record<string, ParamRange>>;

export function defaultParams(type: EffectType): Record<string, number> {
  const spec = PARAM_RANGES[type];
  const params: Record<string, number> = {};
  for (const [key, range] of Object.entries(spec)) {
    params[key] = range.default;
  }
  return params;
}

export function fillParams(
  type: EffectType,
  params: Record<string, number> = {},
): Record<string, number> {
  return { ...defaultParams(type), ...params };
}
