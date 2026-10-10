export const PX_PER_SEC = 80;
/** Matches `--lane-header-width` in style.css */
export const LANE_HEADER_WIDTH_PX = 148;
export const DEFAULT_TIMELINE_SEC = 60;
const TIMELINE_PADDING_SEC = 2;

export { trimDurationSec as clipDurationSec } from '../audio/sliceBuffer';

export function computeTimelineDurationSec(endSecCandidates: number[]): number {
  const maxEnd = endSecCandidates.length > 0 ? Math.max(...endSecCandidates) : 0;
  return Math.max(DEFAULT_TIMELINE_SEC, maxEnd + TIMELINE_PADDING_SEC);
}

export function timelineWidthPx(durationSec: number): number {
  return durationSec * PX_PER_SEC;
}

export function secToPx(sec: number): number {
  return sec * PX_PER_SEC;
}
