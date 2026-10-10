import { useTimelineScale } from '../session/TimelineScale';
import type { ReactNode } from 'react';

type TrackTimelineBodyProps = {
  timelineDurationSec: number;
  children?: ReactNode;
};

export function TrackTimelineBody({
  timelineDurationSec,
  children = null,
}: TrackTimelineBodyProps) {
  const { secToPx, pxPerSec } = useTimelineScale();
  return (
    <div
      className="track-timeline-body"
      style={{ width: secToPx(timelineDurationSec) }}
    >
      {children}
    </div>
  );
}
