import type { TrimRange } from '../../../../shared/types';

export function trimDurationSec(trim: TrimRange): number {
  return Math.max(0, trim.end - trim.start);
}

export function channelDataForTrim(buffer: AudioBuffer, trim: TrimRange): Float32Array[] {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(trim.start * sampleRate));
  const endSample = Math.min(buffer.length, Math.ceil(trim.end * sampleRate));
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i).slice(startSample, endSample));
  }
  return channels;
}

export function timelineClipStartSec(recordStartSec: number, trim: TrimRange): number {
  return recordStartSec + trim.start;
}
