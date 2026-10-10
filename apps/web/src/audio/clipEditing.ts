import type { TrimRange } from '../../../../shared/types';
export function anchorForTimelineStart(start: number, trim: TrimRange): number {
  return Math.max(0, start) - trim.start;
}
export function resizedTrim(trim: TrimRange, edge: 'start' | 'end', delta: number, duration: number, timelineStart: number): TrimRange {
  const minLength = Math.min(0.05, duration);
  if (edge === 'start') {
    return {start: Math.max(0, trim.start - timelineStart, Math.min(trim.end - minLength, trim.start + delta)), end: trim.end};
  }
  return {start: trim.start, end: Math.max(trim.start + minLength, Math.min(duration, trim.end + delta))};
}
