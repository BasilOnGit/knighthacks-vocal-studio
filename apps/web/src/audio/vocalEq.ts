import type * as Tone from 'tone';

/** Peaking Q: wide mud cuts, wide presence so 3–5 kHz does not get harsh. */
export function vocalPeakingQ(gainDb: number, band: 'body' | 'presence'): number {
  const amount = Math.abs(gainDb);
  if (amount < 0.2) {
    return 0.5;
  }
  if (band === 'body') {
    return gainDb < 0 ? 0.65 + Math.min(amount, 8) * 0.03 : 0.9 + Math.min(amount, 6) * 0.03;
  }
  return gainDb < 0 ? 0.85 : 0.75 + Math.min(amount, 8) * 0.03;
}

export function vocalShelfQ(band: 'low' | 'high'): number {
  return band === 'low' ? 0.6 : 0.4;
}

export function applyVocalHighpass(filter: Tone.Filter, frequencyHz: number): void {
  filter.type = 'highpass';
  filter.frequency.value = frequencyHz;
  filter.rolloff = -12;
  filter.Q.value = 0.707;
}

export function applyVocalPeaking(
  filter: Tone.Filter,
  frequencyHz: number,
  gainDb: number,
  band: 'body' | 'presence',
): void {
  filter.type = 'peaking';
  filter.frequency.value = frequencyHz;
  filter.gain.value = gainDb;
  filter.Q.value = vocalPeakingQ(gainDb, band);
}

export function applyVocalShelf(
  filter: Tone.Filter,
  frequencyHz: number,
  gainDb: number,
  band: 'low' | 'high',
): void {
  filter.type = band === 'low' ? 'lowshelf' : 'highshelf';
  filter.frequency.value = frequencyHz;
  filter.gain.value = gainDb;
  filter.Q.value = vocalShelfQ(band);
}
