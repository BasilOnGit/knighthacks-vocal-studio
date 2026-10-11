/** Stored preset values use BandLab-style numbers; convert to engine units at the DSP boundary. */

export function percentToUnit(pct: number): number {
  return Math.min(100, Math.max(0, pct)) / 100;
}

/** Studio Reverb Size (0–100%) → decay time (seconds). */
export function reverbSizeToDecaySec(sizePct: number): number {
  const s = percentToUnit(sizePct);
  return 0.35 + s * 2.5;
}

export function decaySecToSizePct(decaySec: number): number {
  const d = Math.max(0.35, Math.min(2.85, decaySec));
  return ((d - 0.35) / 2.5) * 100;
}

/** Pre-delay derived from room size (BandLab bundles this into Size). */
export function reverbSizeToPreDelayMs(sizePct: number): number {
  return 8 + (Math.min(100, Math.max(0, sizePct)) / 100) * 45;
}

/** Studio Reverb Tone (0–100%): lower = darker tail. */
export function reverbToneBrightness(tonePct: number): number {
  const t = percentToUnit(tonePct);
  return 0.45 + t * 0.65;
}
