import type { TrimRange } from '../../../../shared/types';
import { timelineClipStartSec, trimDurationSec } from '../audio/sliceBuffer';

export type SessionAudioClip = {
  buffer: AudioBuffer;
  trim: TrimRange;
  /** Timeline anchor (same role as vocal record start before trim offset). */
  clipStartSec: number;
  fileName: string;
};

export function createSessionClip(
  buffer: AudioBuffer,
  fileName: string,
  atTimelineSec: number,
): SessionAudioClip {
  return {
    buffer,
    trim: { start: 0, end: buffer.duration },
    clipStartSec: atTimelineSec,
    fileName,
  };
}

export function clipTimelineEndSec(clip: SessionAudioClip): number {
  return timelineClipStartSec(clip.clipStartSec, clip.trim) + trimDurationSec(clip.trim);
}

export function clipTimelineStartSec(clip: SessionAudioClip): number {
  return timelineClipStartSec(clip.clipStartSec, clip.trim);
}
