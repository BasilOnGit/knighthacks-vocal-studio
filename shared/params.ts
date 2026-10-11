import type { EffectType } from './types';

export const MAX_EFFECTS = 10;

/** Default sort when the user manually adds effects in the UI. AI presets keep model order. */
export const FIXED_ORDER: readonly EffectType[] = [
  'gate',
  'autotune',
  'eq',
  'compressor',
  'deesser',
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
  gate: {
    thresholdDb: { min: -80, max: 15, default: -45 },
    attackMs: { min: 0.01, max: 2000, default: 5 },
    releaseMs: { min: 1, max: 5000, default: 100 },
  },
  autotune: {
    mix: { min: 0, max: 1, default: 0 },
    speed: { min: 0, max: 1, default: 0.75 },
    retuneSpeed: { min: 0, max: 1, default: 0.75 },
    snap: { min: 0, max: 1, default: 0.85 },
    key: { min: 0, max: 11, default: 0 },
    scaleMajor: { min: 0, max: 1, default: 1 },
    shiftSemitones: { min: -12, max: 12, default: 0 },
  },
  eq: {
    lowCutHz: { min: 20, max: 400, default: 85 },
    lowShelfHz: { min: 80, max: 400, default: 180 },
    lowShelfDb: { min: -12, max: 6, default: 0 },
    bodyHz: { min: 200, max: 600, default: 320 },
    bodyDb: { min: -12, max: 6, default: -1.5 },
    presenceHz: { min: 2000, max: 6000, default: 3800 },
    presenceDb: { min: -12, max: 8, default: 1.5 },
    airHz: { min: 8000, max: 14000, default: 11000 },
    airDb: { min: -12, max: 8, default: 2 },
  },
  compressor: {
    thresholdDb: { min: -40, max: 0, default: -20 },
    ratio: { min: 1, max: 12, default: 3.5 },
    attackMs: { min: 1, max: 50, default: 6 },
    releaseMs: { min: 50, max: 500, default: 110 },
    makeupDb: { min: 0, max: 12, default: 3 },
    kneeDb: { min: 0, max: 24, default: 9 },
    mix: { min: 0, max: 1, default: 0.82 },
  },
  deesser: {
    freqHz: { min: 4000, max: 10000, default: 6500 },
    thresholdDb: { min: -40, max: 0, default: -24 },
    mix: { min: 0, max: 1, default: 0.7 },
  },
  saturation: {
    drive: { min: 0, max: 1, default: 0.1 },
    mix: { min: 0, max: 0.7, default: 0.14 },
  },
  chorus: {
    rateHz: { min: 0.5, max: 4, default: 1.5 },
    depth: { min: 0, max: 1, default: 0.3 },
    mix: { min: 0, max: 0.5, default: 0 },
  },
  delay: {
    timeMs: { min: 50, max: 800, default: 380 },
    feedback: { min: 0, max: 0.6, default: 0.18 },
    mix: { min: 0, max: 0.5, default: 0 },
  },
  reverb: {
    decaySec: { min: 0.3, max: 5, default: 0.85 },
    preDelayMs: { min: 0, max: 100, default: 28 },
    mix: { min: 0, max: 0.6, default: 0.11 },
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
