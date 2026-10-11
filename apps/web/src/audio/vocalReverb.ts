import type * as Tone from 'tone';
import { reverbToneBrightness } from '../../../../shared/bandlabScale.ts';
import { vocalSendMix } from './autotuneSnap.ts';

/** Keep mud out of the reverb send. */
export const VOCAL_REVERB_HPF_HZ = 280;
/** Small extra pad — mix is already BandLab-linear, so don't bury the tail. */
export const VOCAL_REVERB_WET_TRIM_DB = -1.5;

/** Short rooms (BandLab Size ~17%, Tone ~18%) stay dark. Long halls get a little more air. */
const TAIL_LPF_SHORT_HZ = 3400;
const TAIL_LPF_LONG_HZ = 5000;
const SEND_LPF_OFFSET_HZ = 700;

/** Darken the reverb return — Tone.js IRs are grainy unless the top is rolled off. */
export function vocalReverbLpfHz(decaySec: number, tonePct = 50): number {
  const decay = Math.max(0.3, decaySec);
  const t = Math.min(1, (decay - 0.3) / 4.7);
  const base = TAIL_LPF_SHORT_HZ + t * (TAIL_LPF_LONG_HZ - TAIL_LPF_SHORT_HZ);
  return base * reverbToneBrightness(tonePct);
}

/** Band-limit what hits the convolver so sibilance does not excite a harsh IR. */
export function vocalReverbSendLpfHz(decaySec: number, tonePct = 50): number {
  return Math.min(5_800, vocalReverbLpfHz(decaySec, tonePct) + SEND_LPF_OFFSET_HZ);
}

export function vocalReverbWetTrimGain(): number {
  return Math.pow(10, VOCAL_REVERB_WET_TRIM_DB / 20);
}

export function applyReverbMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = vocalSendMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}
