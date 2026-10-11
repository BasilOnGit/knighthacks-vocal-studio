import * as Tone from 'tone';
import { equalPowerMix } from './autotuneSnap';

/** Keep repeats from stacking mud and fizz. */
export const VOCAL_DELAY_HPF_HZ = 320;
export const VOCAL_DELAY_LPF_HZ = 6_800;

export function vocalDelayFeedback(feedback01: number): number {
  return Math.min(0.58, Math.max(0, feedback01) * 0.9);
}

export function applyDelayMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = equalPowerMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}
