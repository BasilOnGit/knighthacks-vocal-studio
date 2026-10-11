import type * as Tone from 'tone';

/** Soft high-band compressor — BandLab DeEsser is surgical, not a brickwall. */
export const DEESSER_KNEE_DB = 10;
export const DEESSER_ATTACK_SEC = 0.002;
export const DEESSER_RELEASE_SEC = 0.06;

/** Mix 0 = transparent (ratio 1). Mix 1 = gentle 6:1 on the air band only. */
export function deesserRatio(mix01: number): number {
  const mix = Math.min(1, Math.max(0, mix01));
  return 1 + mix * 5;
}

export function applyDeesserCrossover(
  low: Tone.Filter,
  high: Tone.Filter,
  freqHz: number,
): void {
  const freq = Math.max(80, freqHz);
  low.type = 'lowpass';
  low.frequency.value = freq;
  low.rolloff = -24;
  low.Q.value = 0.707;
  high.type = 'highpass';
  high.frequency.value = freq;
  high.rolloff = -24;
  high.Q.value = 0.707;
}

export function applyDeesserCompressor(
  compressor: Tone.Compressor,
  thresholdDb: number,
  mix01: number,
): void {
  compressor.threshold.value = thresholdDb;
  compressor.ratio.value = deesserRatio(mix01);
  compressor.attack.value = DEESSER_ATTACK_SEC;
  compressor.release.value = DEESSER_RELEASE_SEC;
  compressor.knee.value = DEESSER_KNEE_DB;
}
