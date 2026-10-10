import type { TrimRange } from '../../../../shared/types';
import { timelineClipStartSec, trimDurationSec } from '../audio/sliceBuffer';
import { TimelineClip } from './TimelineClip';
import { TrackTimelineBody } from './TrackTimelineBody';
import { TrimWaveViewport } from './TrimWaveViewport';

type VocalRowProps = {
  recording: boolean;
  timelineDurationSec: number;
  clipStartSec: number;
  recordingElapsedSec: number;
  trim: TrimRange | null;
  recordError: string | null;
  buffer: AudioBuffer | null;
  onTrimChange: (trim: TrimRange) => void;
  onClipTimelineStartChange: (timelineStartSec: number) => void;
};

export function VocalRow({
  recording,
  timelineDurationSec,
  clipStartSec,
  recordingElapsedSec,
  trim,
  recordError,
  buffer,
  onTrimChange,
  onClipTimelineStartChange,
}: VocalRowProps) {
  const clipDuration = trim ? trimDurationSec(trim) : 0;
  const timelineStart = trim ? timelineClipStartSec(clipStartSec, trim) : clipStartSec;

  return (
    <section className="track-lane track-lane--timeline" aria-label="Vocal track">
      <div className="track-lane-header">
        <span className="track-lane-name">Vocal</span>
        {recording ? (
          <span className="track-lane-meta track-lane-meta--recording">
            Recording {formatDuration(recordingElapsedSec)}s
          </span>
        ) : trim && clipDuration > 0 ? (
          <span className="track-lane-meta">{formatDuration(clipDuration)}s on timeline</span>
        ) : (
          <span className="track-lane-meta">No take</span>
        )}
        {trim && !recording && clipDuration > 0 ? (
          <span className="track-lane-meta">Plays @ {formatDuration(timelineStart)}s</span>
        ) : null}
        <p className="track-lane-note" role="note">
          Drag the clip to move it; drag the left or right edge to trim or extend.
        </p>
      </div>
      <div className="track-lane-clip track-lane-clip--timeline">
        {recordError ? (
          <p className="record-error" role="alert">
            {recordError}
          </p>
        ) : null}
        <TrackTimelineBody timelineDurationSec={timelineDurationSec}>
          {recording ? (
            <TimelineClip
              startSec={clipStartSec}
              durationSec={Math.max(recordingElapsedSec, 0.05)}
              variant="recording"
            />
          ) : null}
          {buffer && trim && clipDuration > 0 && !recording ? (
            <TimelineClip startSec={timelineStart} durationSec={clipDuration} variant="audio">
              <TrimWaveViewport
                buffer={buffer}
                trim={trim}
                timelineStartSec={timelineStart}
                onTrimChange={onTrimChange}
                onTimelineStartChange={onClipTimelineStartChange}
              />
            </TimelineClip>
          ) : null}
          {!buffer && !recording ? (
            <p className="timeline-empty-hint">Record to place a clip on the timeline</p>
          ) : null}
        </TrackTimelineBody>
      </div>
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 10) {
    return seconds.toFixed(1).replace(/\.0$/, '');
  }
  return String(Math.round(seconds * 10) / 10);
}
