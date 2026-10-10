import React from 'react';
import type { TrimRange } from '../../../../shared/types';
import { AUDIO_FILE_ACCEPT } from '../audio/decodeAudioFile';
import { timelineClipStartSec, trimDurationSec } from '../audio/sliceBuffer';
import type { SessionAudioClip } from '../session/clip';
import { TimelineClip } from './TimelineClip';
import { TrackTimelineBody } from './TrackTimelineBody';
import { TrimWaveViewport } from './TrimWaveViewport';

type AudioImportRowProps = {
  trackLabel: string;
  ariaLabel: string;
  timelineDurationSec: number;
  clip: SessionAudioClip | null;
  importBusy: boolean;
  importError: string | null;
  onImportFile: (file: File) => void;
  onTrimChange: (trim: TrimRange) => void;
  onClipTimelineStartChange: (timelineStartSec: number) => void;
  onRemoveTrack?: () => void;
  onClearClip?: () => void;
};

export function AudioImportRow({
  trackLabel,
  ariaLabel,
  timelineDurationSec,
  clip,
  importBusy,
  importError,
  onImportFile,
  onTrimChange,
  onClipTimelineStartChange,
  onRemoveTrack,
  onClearClip,
}: AudioImportRowProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const clipDuration = clip ? trimDurationSec(clip.trim) : 0;
  const timelineStart = clip ? timelineClipStartSec(clip.clipStartSec, clip.trim) : 0;

  return (
    <section className="track-lane track-lane--timeline" aria-label={ariaLabel}>
      <div className="track-lane-header">
        <span className="track-lane-name">{trackLabel}</span>
        {clip && clipDuration > 0 ? (
          <>
            <span className="track-lane-meta track-lane-meta--filename" title={clip.fileName}>
              {clip.fileName}
            </span>
            <span className="track-lane-meta">{formatDuration(clipDuration)}s</span>
            <span className="track-lane-meta">@ {formatDuration(timelineStart)}s</span>
          </>
        ) : (
          <span className="track-lane-meta">No audio</span>
        )}
        <div className="track-lane-actions">
          <button
            type="button"
            className="track-lane-import"
            disabled={importBusy}
            onClick={() => inputRef.current?.click()}
          >
            {clip ? 'Replace' : 'Upload'}
          </button>
          {clip && onClearClip ? (
            <button type="button" className="track-lane-clear" onClick={onClearClip}>
              Clear
            </button>
          ) : null}
          {onRemoveTrack ? (
            <button type="button" className="track-lane-remove" onClick={onRemoveTrack}>
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="track-lane-file-input"
          accept={AUDIO_FILE_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              onImportFile(file);
            }
          }}
        />
        {importError ? (
          <p className="record-error" role="alert">
            {importError}
          </p>
        ) : null}
      </div>
      <div className="track-lane-clip track-lane-clip--timeline">
        <TrackTimelineBody timelineDurationSec={timelineDurationSec}>
          {clip && clipDuration > 0 ? (
            <TimelineClip
              startSec={timelineStart}
              durationSec={clipDuration}
              variant="import"
            >
              <TrimWaveViewport
                buffer={clip.buffer}
                trim={clip.trim}
                timelineStartSec={timelineStart}
                onTrimChange={onTrimChange}
                onTimelineStartChange={onClipTimelineStartChange}
              />
            </TimelineClip>
          ) : (
            <p className="timeline-empty-hint">Upload an audio file to place it on the timeline</p>
          )}
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
