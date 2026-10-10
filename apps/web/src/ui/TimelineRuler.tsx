import { useTimelineScale } from '../session/TimelineScale';
import { timelineSecFromClientX } from './TimelinePlayhead';

type TimelineRulerProps = {
  durationSec: number;
  seekDisabled?: boolean;
  onSeek?: (sec: number) => void;
};

export function TimelineRuler({ durationSec, seekDisabled = false, onSeek }: TimelineRulerProps) {
  const { secToPx, pxPerSec } = useTimelineScale();
  const ticks: number[] = [];
  const step = durationSec > 120 ? 5 : pxPerSec < 40 ? 2 : 1;
  for (let t = 0; t <= durationSec; t += step) {
    ticks.push(t);
  }

  return (
    <div className="timeline-ruler" aria-hidden="true">
      <div className="timeline-ruler-header-spacer" />
      <div
        className="timeline-ruler-track"
        style={{ width: secToPx(durationSec) }}
        onPointerDown={(event) => {
          if (seekDisabled || event.button !== 0 || !onSeek) {
            return;
          }
          const scroll = event.currentTarget.closest('.arrangement-h-scroll') as HTMLElement | null;
          if (!scroll) {
            return;
          }
          onSeek(timelineSecFromClientX(event.clientX, scroll, durationSec, pxPerSec));
        }}
      >
        {ticks.map((t) => (
          <span
            key={t}
            className="timeline-ruler-tick"
            style={{ left: secToPx(t) }}
          >
            {formatRulerLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatRulerLabel(sec: number): string {
  if (sec < 60) {
    return `${sec}s`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
