import { useTimelineScale } from '../session/TimelineScale';
import { timelineSecFromClientX } from '../session/timelineCoords';
import type { SeekPhase } from '../hooks/usePlayheadTransport';
import React from 'react';

type TimelinePlayheadProps = {
  positionSec: number;
  durationSec: number;
  disabled?: boolean;
  onSeek: (sec: number, phase: SeekPhase) => void;
  onJump: (sec: number) => void;
};

export function TimelinePlayhead({
  positionSec,
  durationSec,
  disabled = false,
  onSeek,
  onJump,
}: TimelinePlayheadProps) {
  const { secToPx, pxPerSec } = useTimelineScale();
  const layerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number } | null>(null);
  const onSeekRef = React.useRef(onSeek);
  const onJumpRef = React.useRef(onJump);
  onSeekRef.current = onSeek;
  onJumpRef.current = onJump;
  const [dragging, setDragging] = React.useState(false);

  const resolveSec = React.useCallback(
    (clientX: number) => {
      const scroll = layerRef.current?.closest('.arrangement-h-scroll') as HTMLElement | null;
      if (!scroll) {
        return positionSec;
      }
      return timelineSecFromClientX(clientX, scroll, durationSec, pxPerSec);
    },
    [durationSec, positionSec, pxPerSec],
  );

  const endDrag = React.useCallback(
    (target: HTMLElement, pointerId: number, clientX: number) => {
      if (dragRef.current?.pointerId !== pointerId) {
        return;
      }
      dragRef.current = null;
      setDragging(false);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      onSeekRef.current(resolveSec(clientX), 'commit');
    },
    [resolveSec],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId };
    setDragging(true);
    onSeekRef.current(resolveSec(event.clientX), 'scrub');
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    onSeekRef.current(resolveSec(event.clientX), 'scrub');
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    endDrag(event.currentTarget, event.pointerId, event.clientX);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    endDrag(event.currentTarget, event.pointerId, event.clientX);
  };

  const leftPx = secToPx(positionSec);

  return (
    <div ref={layerRef} className="timeline-playhead-layer">
      <div
        className={`timeline-playhead-scrub${dragging ? ' timeline-playhead-scrub--dragging' : ''}`}
        style={{ left: `calc(var(--lane-header-width) + ${leftPx}px)` }}
        role="slider"
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={durationSec}
        aria-valuenow={positionSec}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }
          const step = event.shiftKey ? 1 : 0.25;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onJumpRef.current(Math.max(0, positionSec - step));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            onJumpRef.current(Math.min(durationSec, positionSec + step));
          }
        }}
      >
        <span className="timeline-playhead-knob" aria-hidden="true" />
        <span className="timeline-playhead-line" aria-hidden="true" />
      </div>
    </div>
  );
}
