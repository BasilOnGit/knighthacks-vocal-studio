import type { TrimRange } from '../../../../shared/types';
import { Waveform } from './Waveform';

type VocalRowProps = {
  recording: boolean;
  durationSec: number | null;
  trim: TrimRange | null;
  recordError: string | null;
  buffer: AudioBuffer | null;
  onRecord: () => void;
  onTrimChange: (trim: TrimRange) => void;
};

export function VocalRow({
  recording,
  durationSec,
  trim,
  recordError,
  buffer,
  onRecord,
  onTrimChange,
}: VocalRowProps) {
  return (
    <section className="track-row" aria-label="Vocal track">
      <p className="warning" role="note">
        Wear headphones when recording. Speakers will leak into the mic.
      </p>
      <div className="track-controls">
        <button type="button" onClick={onRecord}>
          {recording ? 'Stop' : 'Record'}
        </button>
        <span className="track-label">Vocal</span>
        {durationSec != null ? (
          <span className="record-duration">Recorded {formatDuration(durationSec)}s</span>
        ) : null}
        {trim ? (
          <span className="record-duration">
            Trim {formatDuration(trim.start)}s–{formatDuration(trim.end)}s
          </span>
        ) : null}
      </div>
      {recordError ? (
        <p className="record-error" role="alert">
          {recordError}
        </p>
      ) : null}
      {buffer ? (
        <Waveform buffer={buffer} onTrimChange={onTrimChange} />
      ) : (
        <div className="waveform-slot">Record a take to see the waveform</div>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  return String(Math.round(seconds));
}
