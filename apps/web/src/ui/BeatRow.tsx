import type { TrimRange } from '../../../../shared/types';
import type { SessionAudioClip } from '../session/clip';
import { AudioImportRow } from './AudioImportRow';

type BeatRowProps = {
  timelineDurationSec: number;
  clip: SessionAudioClip | null;
  importBusy: boolean;
  importError: string | null;
  onImportFile: (file: File) => void;
  onTrimChange: (trim: TrimRange) => void;
  onClipTimelineStartChange: (timelineStartSec: number) => void;
  onClearClip: () => void;
};

export function BeatRow(props: BeatRowProps) {
  return (
    <AudioImportRow
      trackLabel="Beat"
      ariaLabel="Beat track"
      {...props}
      onRemoveTrack={undefined}
    />
  );
}
