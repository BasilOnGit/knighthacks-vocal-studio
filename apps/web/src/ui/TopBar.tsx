function formatTransportTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

type TopBarProps = {
  playing: boolean;
  recording: boolean;
  canPlay: boolean;
  positionSec: number;
  dry: boolean;
  masterDb: number;
  onPlay: () => void;
  onRecord: () => void;
  onStop: () => void;
  onDryChange: (dry: boolean) => void;
  onMasterDbChange: (db: number) => void;
};

export function TopBar({
  playing,
  recording,
  canPlay,
  positionSec,
  dry,
  masterDb,
  onPlay,
  onRecord,
  onStop,
  onDryChange,
  onMasterDbChange,
}: TopBarProps) {
  return (
    <header className="transport">
      <div className="transport-brand">Vocal Studio</div>
      <div className="transport-center">
        <span className="transport-time" aria-label="Playback time">
          {formatTransportTime(positionSec)}
        </span>
        <div className="transport-buttons" role="group" aria-label="Transport">
          <button
            type="button"
            className={`transport-btn transport-btn--play${playing ? ' transport-btn--active' : ''}`}
            onClick={onPlay}
            disabled={!canPlay || playing || recording}
            aria-label="Play"
          >
            Play
          </button>
          <button
            type="button"
            className={`transport-btn transport-btn--record${recording ? ' transport-btn--recording' : ''}`}
            onClick={onRecord}
            disabled={recording}
            aria-label="Record"
          >
            Record
          </button>
          <button
            type="button"
            className="transport-btn transport-btn--stop"
            onClick={onStop}
            aria-label="Stop"
          >
            Stop
          </button>
        </div>
        <label className="transport-toggle">
          <input
            type="checkbox"
            checked={dry}
            onChange={(e) => onDryChange(e.target.checked)}
          />
          Dry
        </label>
      </div>
      <label className="transport-master">
        <span className="transport-master-label">Master</span>
        <input
          type="range"
          className="transport-master-slider"
          min={-24}
          max={6}
          step={1}
          value={masterDb}
          onChange={(e) => onMasterDbChange(Number(e.target.value))}
          aria-describedby="master-hint"
        />
        <span className="transport-master-value">{masterDb} dB</span>
        <span id="master-hint" className="transport-master-hint">
          Not in the audio path yet
        </span>
      </label>
    </header>
  );
}
