import type * as Tone from 'tone';
import { vocalSendMix } from './autotuneSnap.ts';

/** BandLab D-Delay: dark repeats on the wet tap; HPF/LPF only in the feedback loop. */
export const VOCAL_DELAY_HPF_HZ = 380;
export const VOCAL_DELAY_LPF_HZ = 5_200;

export function vocalDelayFeedback(feedback01: number): number {
  return Math.min(0.58, Math.max(0, feedback01) * 0.9);
}

export function applyDelayMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = vocalSendMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}
