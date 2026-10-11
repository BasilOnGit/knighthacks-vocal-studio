import * as Tone from 'tone';
import { equalPowerMix } from './autotuneSnap';

/** Vocal send EQ — clarity in the tail without a boomy wash. */
export const VOCAL_REVERB_HPF_HZ = 190;
export const VOCAL_REVERB_LPF_HZ = 9_200;

/** Slightly darken long tails so halls do not turn metallic. */
export function vocalReverbLpfHz(decaySec: number): number {
  const decay = Math.max(0.3, decaySec);
  if (decay <= 1.2) {
    return VOCAL_REVERB_LPF_HZ;
  }
  const darken = Math.min(2_200, (decay - 1.2) * 550);
  return VOCAL_REVERB_LPF_HZ - darken;
}

export function applyReverbMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = equalPowerMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}
