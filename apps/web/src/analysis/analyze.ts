import Meyda from 'meyda';
import type { VoiceFeatures } from '../../../../shared/types';
import { buildPitchTrack } from '../audio/pitchTrack.ts';
import { keyFromPitchFrames } from './detectKey';

const FRAME = 2048;
const HOP = 1024;
const SILENCE_DB = -120;
const PITCH_STABILITY_CAP_SEMITONES = 6;
const SIBILANCE_FRAME_STRIDE = 4;
const MAX_SIBILANCE_FRAMES = 48;

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

  const pitchFrames = buildPitchTrack(buffer, { start, end });
  const pitches = pitchFrames.filter((frame) => frame.pitchHz > 0).map((frame) => frame.pitchHz);
  const keyResult = keyFromPitchFrames(pitchFrames);

  const centroids: number[] = [];
  let sibilanceHigh = 0;
  let sibilanceMid = 0;
  let sibilanceSamples = 0;
  if (voicedOffsets.length > 0) {
    Meyda.bufferSize = FRAME;
    Meyda.sampleRate = sampleRate;
    for (let i = 0; i < voicedOffsets.length; i++) {
      const offset = voicedOffsets[i];
      const frame = mono.subarray(offset, offset + FRAME);
      Meyda.bufferSize = FRAME;
      const extracted = Meyda.extract(['spectralCentroid'], frame);
      const bins = extracted?.spectralCentroid;
      if (typeof bins === 'number' && Number.isFinite(bins)) {
        centroids.push((bins * sampleRate) / FRAME);
      }
      if (
        sibilanceSamples < MAX_SIBILANCE_FRAMES &&
        i % SIBILANCE_FRAME_STRIDE === 0
      ) {
        const bands = bandEnergies(frame, sampleRate);
        sibilanceHigh += bands.high;
        sibilanceMid += bands.mid;
        sibilanceSamples += 1;
      }
    }
  }

  const loudnessDb = voicedDb.length === 0 ? SILENCE_DB : mean(voicedDb);
  const sibilanceRatio =
    sibilanceMid > 0 ? sibilanceHigh / sibilanceMid : sibilanceHigh > 0 ? 1 : 0;

  return {
    loudnessDb,
    peakDb,
    centroidHz: centroids.length === 0 ? 0 : mean(centroids),
    pitchHz: pitches.length === 0 ? 0 : median(pitches),
    noiseFloorDb,
    voicedSeconds: (voicedOffsets.length * HOP) / sampleRate,
    key: keyResult.key,
    scaleMajor: keyResult.scaleMajor,
    keyConfidence: keyResult.keyConfidence,
    pitchStability: pitchStability(pitches),
    crestDb: peakDb - loudnessDb,
    sibilanceRatio,
    bpm: 0,
  };
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function pitchStability(pitches: number[]): number {
  if (pitches.length < 2) {
    return 0;
  }
  const midis = pitches.map((hz) => hzToMidi(hz));
  const avg = mean(midis);
  let variance = 0;
  for (const midi of midis) {
    variance += (midi - avg) ** 2;
  }
  const stdev = Math.sqrt(variance / midis.length);
  return Math.max(0, Math.min(1, 1 - stdev / PITCH_STABILITY_CAP_SEMITONES));
}

function bandEnergies(
  frame: Float32Array,
  sampleRate: number,
): { mid: number; high: number } {
  Meyda.bufferSize = frame.length;
  Meyda.sampleRate = sampleRate;
  const spectrum = Meyda.extract('amplitudeSpectrum', frame) as number[] | undefined;
  if (!spectrum?.length) {
    return { mid: 0, high: 0 };
  }
  const binHz = sampleRate / frame.length;
  let mid = 0;
  let high = 0;
  for (let i = 0; i < spectrum.length; i++) {
    const freq = i * binHz;
    const energy = spectrum[i] * spectrum[i];
    if (freq >= 1000 && freq < 6000) {
      mid += energy;
    } else if (freq >= 6000) {
      high += energy;
    }
  }
  return { mid, high };
}

export function featureWarnings(features: VoiceFeatures): string[] {
  const warnings: string[] = [];
  if (features.voicedSeconds < 3) {
    warnings.push('Very short clip — measurements may be less reliable.');
  }
  if (features.peakDb > -1) {
    warnings.push('Peaks are near clipping — lower input gain or step back from the mic.');
  }
  if (features.loudnessDb < -40) {
    warnings.push('Level is very low — raise gain or move closer to the mic.');
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
