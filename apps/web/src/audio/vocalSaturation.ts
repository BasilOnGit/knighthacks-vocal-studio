import type * as Tone from 'tone';
import { equalPowerMix } from './autotuneSnap.ts';

const CURVE_LENGTH = 2048;

/** Roll off fizzy harmonics from the wet path. */
export const VOCAL_SATURATION_POST_LPF_HZ = 10_500;

/** Soft asymmetric curve — warmth without gritty buzz. */
export function saturationCurve(drive01: number): Float32Array {
  const curve = new Float32Array(CURVE_LENGTH);
  const amount = Math.pow(Math.min(1, Math.max(0, drive01)), 0.85);
  const drive = 1 + amount * 4;
  const norm = Math.tanh(drive);
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const x = (i / (CURVE_LENGTH - 1)) * 2 - 1;
    const shaped =
      x >= 0 ? Math.tanh(drive * x) : Math.tanh(drive * 0.75 * x);
    curve[i] = shaped / norm;
  }
  return curve;
}

/** Keep level stable as drive increases. */
export function saturationTrimDb(drive01: number): number {
  const amount = Math.min(1, Math.max(0, drive01));
  return -amount * 2.5;
}

export function applySaturationMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = equalPowerMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}

export function configureVocalShaper(shaper: Tone.WaveShaper, drive01: number): void {
  shaper.curve = saturationCurve(drive01);
  shaper.oversample = '4x';
}
