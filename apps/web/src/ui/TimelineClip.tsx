import type { ReactNode } from 'react';
import { secToPx } from '../session/timeline';

type TimelineClipProps = {
  startSec: number;
  durationSec: number;
  variant?: 'audio' | 'recording' | 'import';
  children?: ReactNode;
};

export function TimelineClip({
  startSec,
  durationSec,
  variant = 'audio',
  children,
}: TimelineClipProps) {
  const widthPx = Math.max(secToPx(durationSec), 3);

  return (
    <div
      className={`timeline-clip timeline-clip--${variant}`}
      style={{
        left: secToPx(startSec),
        width: widthPx,
      }}
    >
      {children}
    </div>
  );
}
