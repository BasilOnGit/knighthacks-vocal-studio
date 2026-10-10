import type { ReactNode } from 'react';
import { secToPx } from '../session/timeline';

type TrackTimelineBodyProps = {
  timelineDurationSec: number;
  children?: ReactNode;
};

export function TrackTimelineBody({
  timelineDurationSec,
  children = null,
}: TrackTimelineBodyProps) {
  return (
    <div
      className="track-timeline-body"
      style={{ width: secToPx(timelineDurationSec) }}
    >
      {children}
    </div>
  );
}
