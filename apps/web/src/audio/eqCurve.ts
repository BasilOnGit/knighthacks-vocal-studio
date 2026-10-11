import { fillParams } from '../../../../shared/params.ts';
import { vocalPeakingQ, vocalShelfQ } from './vocalEq.ts';

const REF_SAMPLE_RATE = 48000;

type Biquad = { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number };

function magnitudeAt(b: Biquad, freqHz: number): number {
  const w = (2 * Math.PI * freqHz) / REF_SAMPLE_RATE;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = b.b0 + b.b1 * cosW + b.b2 * cos2W;
  const numIm = -(b.b1 * sinW + b.b2 * sin2W);
  const denRe = b.a0 + b.a1 * cosW + b.a2 * cos2W;
  const denIm = -(b.a1 * sinW + b.a2 * sin2W);
  const num = numRe * numRe + numIm * numIm;
  const den = denRe * denRe + denIm * denIm;
  if (den <= 0) {
    return 1;
  }
  return Math.sqrt(num / den);
}

function highpassCoeffs(freqHz: number, Q: number): Biquad {
  const w0 = (2 * Math.PI * freqHz) / REF_SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  return { b0, b1, b2, a0, a1, a2 };
}

function lowshelfCoeffs(freqHz: number, gainDb: number, Q: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / REF_SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2);
  const sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha);
  const b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
  const b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha);
  const a0 = (A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha;
  const a1 = -2 * ((A - 1) + (A + 1) * cosW0);
  const a2 = (A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha;
  return { b0, b1, b2, a0, a1, a2 };
}

function highshelfCoeffs(freqHz: number, gainDb: number, Q: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / REF_SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2);
  const sqrtA = Math.sqrt(A);
  const b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
  const b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha);
  const a0 = (A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW0);
  const a2 = (A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha;
  return { b0, b1, b2, a0, a1, a2 };
}

function peakingCoeffs(freqHz: number, gainDb: number, Q: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / REF_SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;
  return { b0, b1, b2, a0, a1, a2 };
}

export function eqMagnitudeDb(freqHz: number, rawParams: Record<string, number>): number {
  const p = fillParams('eq', rawParams);
  const filters: Biquad[] = [
    highpassCoeffs(p.lowCutHz, 0.707),
    lowshelfCoeffs(p.lowShelfHz, p.lowShelfDb, vocalShelfQ('low')),
    peakingCoeffs(p.bodyHz, p.bodyDb, vocalPeakingQ(p.bodyDb, 'body')),
    peakingCoeffs(p.presenceHz, p.presenceDb, vocalPeakingQ(p.presenceDb, 'presence')),
    highshelfCoeffs(p.airHz, p.airDb, vocalShelfQ('high')),
  ];
  let mag = 1;
  for (const b of filters) {
    mag *= magnitudeAt(b, freqHz);
  }
  return 20 * Math.log10(Math.max(mag, 1e-8));
}

export function sampleEqCurve(
  rawParams: Record<string, number>,
  pointCount: number,
  minHz = 40,
  maxHz = 16_000,
): { freqs: number[]; magsDb: number[] } {
  const freqs: number[] = [];
  const magsDb: number[] = [];
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  for (let i = 0; i < pointCount; i += 1) {
    const t = i / (pointCount - 1);
    const freq = Math.pow(10, logMin + t * (logMax - logMin));
    freqs.push(freq);
    magsDb.push(eqMagnitudeDb(freq, rawParams));
  }
  return { freqs, magsDb };
}
