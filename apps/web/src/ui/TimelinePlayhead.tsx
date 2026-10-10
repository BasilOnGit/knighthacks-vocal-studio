import React from 'react';
import { LANE_HEADER_WIDTH_PX, PX_PER_SEC, secToPx } from '../session/timeline';

type TimelinePlayheadProps = {
  positionSec: number;
  durationSec: number;
  disabled?: boolean;
  onPositionChange: (sec: number) => void;
};

export function timelineSecFromClientX(
  clientX: number,
  scrollEl: HTMLElement,
  durationSec: number,
): number {
  const scrollRect = scrollEl.getBoundingClientRect();
  const x = clientX - scrollRect.left + scrollEl.scrollLeft - LANE_HEADER_WIDTH_PX;
  const sec = x / PX_PER_SEC;
  return clamp(sec, 0, Math.max(durationSec, 0));
}

export function TimelinePlayhead({
  positionSec,
  durationSec,
  disabled = false,
  onPositionChange,
}: TimelinePlayheadProps) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; dragging: boolean } | null>(null);
  const onPositionChangeRef = React.useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  const [dragging, setDragging] = React.useState(false);

  const resolveSec = React.useCallback(
    (clientX: number) => {
      const scroll = layerRef.current?.closest('.arrangement-h-scroll') as HTMLElement | null;
      if (!scroll) {
        return positionSec;
      }
      return timelineSecFromClientX(clientX, scroll, durationSec);
    },
    [durationSec, positionSec],
  );

  const endDrag = React.useCallback((target: HTMLElement, pointerId: number) => {
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
      setDragging(false);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, dragging: true };
    setDragging(true);
    onPositionChangeRef.current(resolveSec(event.clientX));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    onPositionChangeRef.current(resolveSec(event.clientX));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    endDrag(event.currentTarget, event.pointerId);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    endDrag(event.currentTarget, event.pointerId);
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
            onPositionChangeRef.current(clamp(positionSec - step, 0, durationSec));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            onPositionChangeRef.current(clamp(positionSec + step, 0, durationSec));
          }
        }}
      >
        <span className="timeline-playhead-knob" aria-hidden="true" />
        <span className="timeline-playhead-line" aria-hidden="true" />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
