import { PitchDetector } from 'pitchy';
import type { TrimRange } from '../../../../shared/types';

const FRAME = 2048;
const HOP = 512;
const CLARITY_MIN = 0.9;
/** Frames quieter than this (RMS) are not analysed — saves time and avoids noise "pitch". */
const MIN_RMS = 0.003;
const MEDIAN_FRAMES = 5;
/** Pitch estimates further than this from their neighbours' median are outliers. */
const OUTLIER_SEMITONES = 3;
/** Unvoiced gaps this short between similar pitches are bridged (detector dropouts). */
const MAX_BRIDGE_FRAMES = 2;
/** Between frames this far apart in pitch (semitones) we step instead of interpolating. */
const INTERPOLATE_MAX_SEMITONES = 1;

export type PitchFrame = {
  timeSec: number;
  pitchHz: number;
};

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function buildPitchTrack(buffer: AudioBuffer, trim: TrimRange): PitchFrame[] {
  const sampleRate = buffer.sampleRate > 0 ? buffer.sampleRate : 44100;
  const startSample = clampSample(trim.start, sampleRate, buffer.length);
  const endSample = clampSample(trim.end, sampleRate, buffer.length);
  if (endSample <= startSample + FRAME) {
    return [];
  }

  const mono = mixMono(buffer, startSample, endSample);
  const detector = PitchDetector.forFloat32Array(FRAME);
  const frames: PitchFrame[] = [];

  for (let offset = 0; offset + FRAME <= mono.length; offset += HOP) {
    const slice = mono.subarray(offset, offset + FRAME);
    const timeSec = (startSample + offset + FRAME / 2) / sampleRate;
    let pitchHz = 0;
    if (rms(slice) >= MIN_RMS) {
      const [pitch, clarity] = detector.findPitch(slice, sampleRate);
      if (clarity >= CLARITY_MIN && pitch > 0 && Number.isFinite(pitch)) {
        pitchHz = pitch;
      }
    }
    frames.push({ timeSec, pitchHz });
  }

  return cleanPitchTrack(frames);
}

/**
 * Remove detector artefacts that would otherwise be "corrected" as if they were singing:
 * octave errors, isolated outliers and one-frame dropouts.
 */
export function cleanPitchTrack(frames: PitchFrame[]): PitchFrame[] {
  const midi = frames.map((frame) => (frame.pitchHz > 0 ? hzToMidi(frame.pitchHz) : null));

  // Octave errors: fold a frame by whole octaves toward the median of its voiced neighbours.
  for (let i = 0; i < midi.length; i++) {
    const value = midi[i];
    if (value === null) {
      continue;
    }
    const neighbours = voicedNeighbours(midi, i, 3);
    if (neighbours.length < 2) {
      continue;
    }
    const reference = medianOf(neighbours);
    const octaves = Math.round((value - reference) / 12);
    if (octaves !== 0 && Math.abs(value - octaves * 12 - reference) < 1.5) {
      midi[i] = value - octaves * 12;
    }
  }

  // Outliers: drop frames far from the median of their neighbourhood.
  const filtered = midi.map((value, i) => {
    if (value === null) {
      return null;
    }
    const neighbours = voicedNeighbours(midi, i, 2);
    if (neighbours.length < 2) {
      return value;
    }
    return Math.abs(value - medianOf(neighbours)) > OUTLIER_SEMITONES ? null : value;
  });

  // Median smoothing of voiced runs.
  const smoothed = filtered.map((value, i) => {
    if (value === null) {
      return null;
    }
    const window = voicedNeighbours(filtered, i, MEDIAN_FRAMES >> 1);
    return window.length > 0 ? medianOf([...window, value]) : value;
  });

  // Bridge very short gaps between similar pitches.
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] !== null) {
      continue;
    }
    let end = i;
    while (end < smoothed.length && smoothed[end] === null) {
      end++;
    }
    const before = i > 0 ? smoothed[i - 1] : null;
    const after = end < smoothed.length ? smoothed[end] : null;
    const gap = end - i;
    if (
      before !== null &&
      after !== null &&
      gap <= MAX_BRIDGE_FRAMES &&
      Math.abs(after - before) < INTERPOLATE_MAX_SEMITONES * 2
    ) {
      for (let k = 0; k < gap; k++) {
        smoothed[i + k] = before + ((after - before) * (k + 1)) / (gap + 1);
      }
    }
    i = end;
  }

  return frames.map((frame, i) => ({
    timeSec: frame.timeSec,
    pitchHz: smoothed[i] === null ? 0 : midiToHz(smoothed[i] as number),
  }));
}

function voicedNeighbours(values: (number | null)[], index: number, radius: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, index - radius); i <= Math.min(values.length - 1, index + radius); i++) {
    const value = values[i];
    if (i !== index && value !== null) {
      out.push(value);
    }
  }
  return out;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pitch at a time: interpolated (in the log/MIDI domain) between voiced neighbours,
 * but stepping — not sliding — across note changes so we never invent in-between notes.
 */
export function pitchHzAtTime(frames: PitchFrame[], timeSec: number): number {
  if (frames.length === 0) {
    return 0;
  }
  if (timeSec <= frames[0].timeSec) {
    return frames[0].pitchHz;
  }
  const last = frames[frames.length - 1];
  if (timeSec >= last.timeSec) {
    return last.pitchHz;
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timeSec <= timeSec) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = frames[lo];
  const b = frames[hi];
  const span = b.timeSec - a.timeSec;
  const t = span > 0 ? (timeSec - a.timeSec) / span : 0;
  // Unvoiced on either side: treat the whole stretch as unvoiced so the corrector can release.
  if (a.pitchHz <= 0 || b.pitchHz <= 0) {
    return t < 0.5 ? a.pitchHz : b.pitchHz;
  }
  const midiA = hzToMidi(a.pitchHz);
  const midiB = hzToMidi(b.pitchHz);
  if (Math.abs(midiB - midiA) > INTERPOLATE_MAX_SEMITONES) {
    return t < 0.5 ? a.pitchHz : b.pitchHz;
  }
  return midiToHz(midiA + (midiB - midiA) * t);
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / buf.length);
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

function clampSample(seconds: number, sampleRate: number, length: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.min(length, Math.max(0, Math.floor(seconds * sampleRate)));
}
