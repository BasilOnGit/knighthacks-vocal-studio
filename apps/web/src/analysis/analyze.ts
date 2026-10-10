import Meyda from 'meyda';
import { PitchDetector } from 'pitchy';
import type { VoiceFeatures } from '../../../../shared/types';

const FRAME = 2048;
const HOP = 1024;
const SILENCE_DB = -120;
const CLARITY_MIN = 0.9;

export function analyze(
  buffer: AudioBuffer,
  start: number,
  end: number,
): VoiceFeatures {
  const sampleRate = buffer.sampleRate > 0 ? buffer.sampleRate : 44100;
  const startSample = clampSample(start, sampleRate, buffer.length);
  const endSample = clampSample(end, sampleRate, buffer.length);
  const rangeEnd = Math.max(startSample, endSample);
  const mono = mixMono(buffer, startSample, rangeEnd);
  const peakDb = toDb(peakAmplitude(buffer, startSample, rangeEnd));

  const frameRms: number[] = [];
  for (let offset = 0; offset + FRAME <= mono.length; offset += HOP) {
    frameRms.push(rms(mono, offset, offset + FRAME));
  }

  const noiseFloorDb = frameRms.length === 0 ? SILENCE_DB : toDb(percentile(frameRms, 0.1));
  const voicedOffsets: number[] = [];
  const voicedDb: number[] = [];
  for (let i = 0; i < frameRms.length; i++) {
    const frameDb = toDb(frameRms[i]);
    if (frameDb >= noiseFloorDb + 10) {
      voicedOffsets.push(i * HOP);
      voicedDb.push(frameDb);
    }
  }

  const centroids: number[] = [];
  const pitches: number[] = [];
  if (voicedOffsets.length > 0) {
    Meyda.bufferSize = FRAME;
    Meyda.sampleRate = sampleRate;
    const detector = PitchDetector.forFloat32Array(FRAME);
    for (const offset of voicedOffsets) {
      const frame = mono.subarray(offset, offset + FRAME);
      Meyda.bufferSize = FRAME;
      const extracted = Meyda.extract(['spectralCentroid'], frame);
      const bins = extracted?.spectralCentroid;
      if (typeof bins === 'number' && Number.isFinite(bins)) {
        centroids.push((bins * sampleRate) / FRAME);
      }
      const [pitch, clarity] = detector.findPitch(frame, sampleRate);
      if (clarity >= CLARITY_MIN && pitch > 0 && Number.isFinite(pitch)) {
        pitches.push(pitch);
      }
    }
  }

  return {
    loudnessDb: voicedDb.length === 0 ? SILENCE_DB : mean(voicedDb),
    peakDb,
    centroidHz: centroids.length === 0 ? 0 : mean(centroids),
    pitchHz: pitches.length === 0 ? 0 : median(pitches),
    noiseFloorDb,
    voicedSeconds: (voicedOffsets.length * HOP) / sampleRate,
  };
}

export function featureWarnings(features: VoiceFeatures): string[] {
  const warnings: string[] = [];
  if (features.voicedSeconds < 3) {
    warnings.push('Very short, results will be generic');
  }
  if (features.peakDb > -1) {
    warnings.push('Clipping, re-record further from the mic');
  }
  if (features.loudnessDb < -40) {
    warnings.push('Too quiet');
  }
  return warnings;
}

function mixMono(buffer: AudioBuffer, start: number, end: number): Float32Array {
  const length = Math.max(0, end - start);
  const mono = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  if (channels === 0 || length === 0) {
    return mono;
  }
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      mono[i] += data[start + i] / channels;
    }
  }
  return mono;
}

function peakAmplitude(buffer: AudioBuffer, start: number, end: number): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = start; i < end; i++) {
      const amplitude = Math.abs(data[i]);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
  }
  return peak;
}

function rms(samples: Float32Array, start: number, end: number): number {
  const length = end - start;
  if (length <= 0) {
    return 0;
  }
  let sum = 0;
  for (let i = start; i < end; i++) {
    const sample = samples[i];
    sum += sample * sample;
  }
  return Math.sqrt(sum / length);
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

function mean(values: number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function toDb(amplitude: number): number {
  if (!(amplitude > 0)) {
    return SILENCE_DB;
  }
  const db = 20 * Math.log10(amplitude);
  if (!Number.isFinite(db)) {
    return SILENCE_DB;
  }
  return Math.max(db, SILENCE_DB);
}

function clampSample(seconds: number, sampleRate: number, length: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.min(length, Math.max(0, Math.floor(seconds * sampleRate)));
}
