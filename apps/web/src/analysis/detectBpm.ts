const MIN_BPM = 70;
const MAX_BPM = 180;

function mixMono(buffer: AudioBuffer, startSample: number, endSample: number): Float32Array {
  const length = Math.max(0, endSample - startSample);
  const mono = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  if (channels === 0 || length === 0) {
    return mono;
  }
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      mono[i] += data[startSample + i] / channels;
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

/** Onset strength envelope (positive spectral-flux style energy steps). */
export function onsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
): { envelope: Float32Array; hopSec: number } {
  const frame = Math.max(256, Math.floor(sampleRate * 0.01));
  const hop = Math.floor(frame / 2);
  const hopSec = hop / sampleRate;
  if (samples.length < frame * 2) {
    return { envelope: new Float32Array(0), hopSec };
  }
  const frames = Math.floor((samples.length - frame) / hop);
  const envelope = new Float32Array(frames);
  let prevEnergy = 0;
  for (let i = 0; i < frames; i++) {
    const offset = i * hop;
    let energy = 0;
    for (let j = 0; j < frame; j++) {
      const sample = samples[offset + j];
      energy += sample * sample;
    }
    energy = Math.sqrt(energy / frame);
    envelope[i] = i === 0 ? energy : Math.max(0, energy - prevEnergy);
    prevEnergy = energy;
  }
  return { envelope, hopSec };
}

function autocorrelationPeakLag(envelope: Float32Array, hopSec: number): number {
  if (envelope.length < 4 || hopSec <= 0) {
    return 0;
  }
  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) / hopSec));
  const maxLag = Math.min(
    envelope.length - 1,
    Math.floor((60 / MIN_BPM) / hopSec),
  );
  if (maxLag <= minLag) {
    return 0;
  }

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < envelope.length - lag; i++) {
      sum += envelope[i] * envelope[i + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }
  return bestLag;
}

export function detectBpmFromMono(samples: Float32Array, sampleRate: number): number {
  if (samples.length < sampleRate * 0.5) {
    return 0;
  }
  const { envelope, hopSec } = onsetEnvelope(samples, sampleRate);
  const lag = autocorrelationPeakLag(envelope, hopSec);
  if (lag <= 0) {
    return 0;
  }
  const periodSec = lag * hopSec;
  const bpm = 60 / periodSec;
  if (!Number.isFinite(bpm)) {
    return 0;
  }
  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
}

export function detectBpm(buffer: AudioBuffer, start: number, end: number): number {
  const sampleRate = buffer.sampleRate > 0 ? buffer.sampleRate : 44100;
  const startSample = clampSample(start, sampleRate, buffer.length);
  const endSample = clampSample(end, sampleRate, buffer.length);
  if (endSample <= startSample) {
    return 0;
  }
  const mono = mixMono(buffer, startSample, endSample);
  return detectBpmFromMono(mono, sampleRate);
}
