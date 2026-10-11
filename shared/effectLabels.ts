import type { EffectType } from './types';

/** User-facing effect names (picker, chain cards, summaries). */
export const EFFECT_DISPLAY_NAMES: Record<EffectType, string> = {
  gate: 'Noise gate',
  denoise: 'Denoise',
  autotune: 'Pitch correction',
  eq: 'EQ',
  compressor: 'Compressor',
  rider: 'Level rider',
  deesser: 'De-esser',
  saturation: 'Saturation',
  chorus: 'Chorus',
  doubler: 'Doubler',
  delay: 'Delay',
  reverb: 'Reverb',
};

export function effectDisplayName(type: EffectType, index?: number): string {
  const base = EFFECT_DISPLAY_NAMES[type];
  if (index === undefined || index <= 1) {
    return base;
  }
  return `${base} ${index}`;
}
