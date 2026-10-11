import { buildPitchTrack, type PitchFrame } from '../audio/pitchTrack.ts';

/** Krumhansl–Kessler major / minor key profiles (pitch class 0 = C). */
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

export type KeyDetection = {
  key: number;
  scaleMajor: number;
  keyConfidence: number;
};

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function rotateProfile(profile: readonly number[], tonic: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    out[i] = profile[(i - tonic + 12) % 12];
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;
  for (let i = 0; i < 12; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }
  const n = 12;
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  return den === 0 ? 0 : num / den;
}

/** Score all 24 keys; exported for unit tests. */
export function bestKeyFromHistogram(histogram: number[]): KeyDetection {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { key: 0, scaleMajor: 1, keyConfidence: 0 };
  }
  const norm = histogram.map((value) => value / total);

  let bestScore = -Infinity;
  let bestKey = 0;
  let bestMajor = 1;
  const scores: number[] = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = pearson(norm, rotateProfile(MAJOR_PROFILE, tonic));
    scores.push(majorScore);
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = tonic;
      bestMajor = 1;
    }
    const minorScore = pearson(norm, rotateProfile(MINOR_PROFILE, tonic));
    scores.push(minorScore);
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = tonic;
      bestMajor = 0;
    }
  }

  scores.sort((a, b) => b - a);
  const runnerUp = scores[1] ?? bestScore;
  const margin = bestScore > 0 ? (bestScore - runnerUp) / bestScore : 0;
  const keyConfidence = Math.max(0, Math.min(1, margin * 4));

  return { key: bestKey, scaleMajor: bestMajor, keyConfidence };
}

export function keyFromPitchFrames(frames: PitchFrame[]): KeyDetection {
  const histogram = new Array<number>(12).fill(0);
  let voiced = 0;
  for (const frame of frames) {
    if (frame.pitchHz <= 0) {
      continue;
    }
    const pitchClass = ((Math.round(hzToMidi(frame.pitchHz)) % 12) + 12) % 12;
    histogram[pitchClass] += 1;
    voiced += 1;
  }
  if (voiced < 8) {
    return { key: 0, scaleMajor: 1, keyConfidence: 0 };
  }
  return bestKeyFromHistogram(histogram);
}

export function detectKey(buffer: AudioBuffer, start: number, end: number): KeyDetection {
  return keyFromPitchFrames(buildPitchTrack(buffer, { start, end }));
}
