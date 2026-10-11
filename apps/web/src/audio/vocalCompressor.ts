import * as Tone from 'tone';
import { equalPowerMix } from './autotuneSnap';

export type VocalCompressorSettings = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
};

/** Map UI release to a slightly longer tail at moderate ratios (smoother vocals). */
export function vocalReleaseSec(releaseMs: number, ratio: number): number {
  const ms = Math.max(50, releaseMs);
  const boost = ratio <= 3 ? 1.08 : ratio <= 6 ? 1 : 0.92;
  return (ms * boost) / 1000;
}

export function applyVocalCompressor(
  compressor: Tone.Compressor,
  settings: VocalCompressorSettings,
): void {
  compressor.threshold.value = settings.thresholdDb;
  compressor.ratio.value = Math.max(1, settings.ratio);
  compressor.attack.value = Math.max(0.001, settings.attackMs / 1000);
  compressor.release.value = vocalReleaseSec(settings.releaseMs, settings.ratio);
  compressor.knee.value = settings.kneeDb;
}

export function applyVocalCompressorMix(dry: Tone.Gain, wet: Tone.Gain, mix01: number): void {
  const { dry: dryAmp, wet: wetAmp } = equalPowerMix(mix01);
  dry.gain.value = dryAmp;
  wet.gain.value = wetAmp;
}

export function readVocalCompressorSettings(
  read: (key: string) => number,
): VocalCompressorSettings {
  return {
    thresholdDb: read('thresholdDb'),
    ratio: read('ratio'),
    attackMs: read('attackMs'),
    releaseMs: read('releaseMs'),
    kneeDb: read('kneeDb'),
  };
}
