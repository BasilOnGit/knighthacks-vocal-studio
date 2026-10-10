import React from 'react';
import type { TrimRange } from '../../../../shared/types';
import { PX_PER_SEC, secToPx } from '../session/timeline';
import { Waveform } from './Waveform';

const TRIM_EDGE_HANDLE_PX = 10;

type TrimWaveViewportProps = {
  buffer: AudioBuffer;
  trim: TrimRange;
  timelineStartSec: number;
  onTrimChange: (trim: TrimRange) => void;
  onTimelineStartChange: (startSec: number) => void;
};

/** Clips the waveform to the active trim on the timeline; inner wave is full take for edge restore. */
export function TrimWaveViewport({
  buffer,
  trim,
  timelineStartSec,
  onTrimChange,
  onTimelineStartChange,
}: TrimWaveViewportProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; originX: number; originStartSec: number } | null>(
    null,
  );
  const onTimelineStartChangeRef = React.useRef(onTimelineStartChange);
  onTimelineStartChangeRef.current = onTimelineStartChange;
  const [dragging, setDragging] = React.useState(false);

  const endClipDrag = React.useCallback((target: HTMLDivElement, pointerId: number) => {
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
      setDragging(false);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    if (localX < TRIM_EDGE_HANDLE_PX || localX > rect.width - TRIM_EDGE_HANDLE_PX) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originStartSec: timelineStartSec,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaSec = (event.clientX - drag.originX) / PX_PER_SEC;
    onTimelineStartChangeRef.current(Math.max(0, drag.originStartSec + deltaSec));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    endClipDrag(event.currentTarget, event.pointerId);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    endClipDrag(event.currentTarget, event.pointerId);
  };

  return (
    <div
      ref={viewportRef}
      className={`trim-wave-viewport${dragging ? ' trim-wave-viewport--dragging' : ''}`}
      onPointerDownCapture={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        className="trim-wave-inner"
        style={{
          width: secToPx(buffer.duration),
          marginLeft: -secToPx(trim.start),
        }}
      >
        <Waveform buffer={buffer} trim={trim} onTrimChange={onTrimChange} />
      </div>
    </div>
  );
}
