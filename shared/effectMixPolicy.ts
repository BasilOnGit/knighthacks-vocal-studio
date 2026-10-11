import { fillParams } from './params.ts';

/**
 * Autotune `mix` is dry+wet parallel in the worklet — partial mix sounds like a
 * detuned double. Map sub-100 mix into retune/snap and run fully wet instead.
 */
export function normalizeAutotuneMixParams(params: Record<string, number>): Record<string, number> {
  const filled = fillParams('autotune', params);
  const mix = filled.mix;
  if (!(mix > 0 && mix < 100)) {
    return filled;
  }

  const factor = mix / 100;
  const next: Record<string, number> = { ...filled, mix: 100 };

  if (typeof next.retuneSpeed === 'number') {
    next.retuneSpeed = Math.min(1, Math.max(0, next.retuneSpeed * factor));
  }
  if (typeof next.snap === 'number') {
    next.snap = Math.min(1, Math.max(0, next.snap * factor));
  }
  if (typeof next.speed === 'number') {
    next.speed = Math.min(1, Math.max(0, next.speed * factor));
  }

  return next;
}
