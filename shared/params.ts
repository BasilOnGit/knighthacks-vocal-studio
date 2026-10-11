import type { EffectType } from './types';

export const MAX_EFFECTS = 12;

/** Add-effect picker order and suggested order for seed presets. Never sorts live chains. */
export const EFFECT_CATALOG: readonly EffectType[] = [
  'gate',
  'denoise',
  'autotune',
  'eq',
  'compressor',
  'rider',
  'deesser',
  'saturation',
  'chorus',
  'doubler',
  'delay',
  'reverb',
] as const;

export type ParamUnit = 'percent' | 'db' | 'ms' | 'hz' | 'ratio';

export interface ParamRange {
  min: number;
  max: number;
  default: number;
  /** How values are shown in the UI (BandLab-style where noted). */
  unit?: ParamUnit;
  /** Extra EQ / tone controls — collapsed under “More”. */
  advanced?: boolean;
}

export const PARAM_RANGES = {
  gate: {
    thresholdDb: { min: -80, max: 0, default: -30, unit: 'db' },
    attackMs: { min: 0.1, max: 2000, default: 5, unit: 'ms' },
    releaseMs: { min: 1, max: 5000, default: 200, unit: 'ms' },
  },
  denoise: {
    amount: { min: 0, max: 100, default: 70, unit: 'percent' },
  },
  autotune: {
    mix: { min: 0, max: 100, default: 0, unit: 'percent' },
    speed: { min: 0, max: 1, default: 0.75 },
    retuneSpeed: { min: 0, max: 1, default: 0.75 },
    snap: { min: 0, max: 1, default: 0.85 },
    key: { min: 0, max: 11, default: 0 },
    scaleMajor: { min: 0, max: 1, default: 1 },
    shiftSemitones: { min: -12, max: 12, default: 0 },
  },
  eq: {
    lowShelfDb: { min: -12, max: 12, default: 0, unit: 'db' },
    bodyDb: { min: -12, max: 12, default: 0, unit: 'db' },
    airDb: { min: -12, max: 12, default: 0, unit: 'db' },
    bodyHz: { min: 120, max: 8000, default: 1000, unit: 'hz' },
    lowCutHz: { min: 20, max: 400, default: 80, unit: 'hz', advanced: true },
    lowShelfHz: { min: 80, max: 400, default: 180, unit: 'hz', advanced: true },
    presenceHz: { min: 2000, max: 6000, default: 3800, unit: 'hz', advanced: true },
    presenceDb: { min: -12, max: 12, default: 0, unit: 'db', advanced: true },
    airHz: { min: 8000, max: 16000, default: 12000, unit: 'hz', advanced: true },
  },
  compressor: {
    thresholdDb: { min: -40, max: 0, default: -20, unit: 'db' },
    ratio: { min: 1, max: 20, default: 3, unit: 'ratio' },
    attackMs: { min: 1, max: 100, default: 10, unit: 'ms' },
    releaseMs: { min: 10, max: 500, default: 60, unit: 'ms' },
    kneeDb: { min: 0, max: 24, default: 12, unit: 'db' },
    makeupDb: { min: 0, max: 12, default: 0, unit: 'db' },
    mix: { min: 0, max: 100, default: 100, unit: 'percent' },
  },
  rider: {
    targetDb: { min: -24, max: -6, default: -18, unit: 'db' },
    speed: { min: 0, max: 1, default: 0.4 },
    maxGainDb: { min: 0, max: 12, default: 6, unit: 'db' },
  },
  deesser: {
    thresholdDb: { min: -40, max: 0, default: -20, unit: 'db' },
    freqHz: { min: 4000, max: 16000, default: 14000, unit: 'hz' },
    mix: { min: 0, max: 100, default: 70, unit: 'percent' },
  },
  saturation: {
    drive: { min: 0, max: 100, default: 8, unit: 'percent' },
    mix: { min: 0, max: 100, default: 10, unit: 'percent' },
  },
  chorus: {
    rateHz: { min: 0.5, max: 4, default: 1.5 },
    depth: { min: 0, max: 100, default: 30, unit: 'percent' },
    mix: { min: 0, max: 100, default: 0, unit: 'percent' },
  },
  doubler: {
    mix: { min: 0, max: 100, default: 25, unit: 'percent' },
    delayMs: { min: 8, max: 40, default: 18, unit: 'ms' },
    width: { min: 0, max: 100, default: 80, unit: 'percent' },
  },
  delay: {
    timeMs: { min: 1, max: 2000, default: 250, unit: 'ms' },
    feedback: { min: 0, max: 100, default: 15, unit: 'percent' },
    mix: { min: 0, max: 100, default: 20, unit: 'percent' },
    pingPong: { min: 0, max: 1, default: 0 },
  },
  reverb: {
    mix: { min: 0, max: 100, default: 41, unit: 'percent' },
    sizePct: { min: 0, max: 100, default: 17, unit: 'percent' },
    tonePct: { min: 0, max: 100, default: 18, unit: 'percent' },
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
