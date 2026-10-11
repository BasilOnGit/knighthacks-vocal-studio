function formatTransportTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

type TopBarProps = {
  pending?: boolean;
  playing: boolean;
  recording: boolean;
  canPlay: boolean;
  canExport: boolean;
  exporting?: boolean;
  positionSec: number;
  dry: boolean;
  loop: boolean;
  masterDb: number;
  onPlay: () => void;
  onRecord: () => void;
  onStop: () => void;
  onDryChange: (dry: boolean) => void;
  onLoopChange: (loop: boolean) => void;
  onExport: () => void;
  onMasterDbChange: (db: number) => void;
};

export function TopBar({
  pending = false,
  playing,
  recording,
  canPlay,
  canExport,
  exporting = false,
  positionSec,
  dry,
  loop,
  masterDb,
  onPlay,
  onRecord,
  onStop,
  onDryChange,
  onLoopChange,
  onExport,
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
            disabled={!canPlay || playing || recording || pending}
            aria-label="Play"
          >
            Play
          </button>
          <button
            type="button"
            className={`transport-btn transport-btn--record${recording ? ' transport-btn--recording' : ''}`}
            onClick={onRecord}
            disabled={recording || pending}
            aria-label="Record"
          >
            Record
          </button>
          <button
            type="button"
            className="transport-btn transport-btn--stop"
            disabled={pending}
            onClick={onStop}
            aria-label="Stop"
          >
            Stop
          </button>
        </div>
        <label className="transport-toggle" title="Bypass all track effect chains (clips stay level/pan only)">
          <input
            type="checkbox"
            checked={dry}
            onChange={(e) => onDryChange(e.target.checked)}
          />
          Bypass FX
        </label>
        <label className="transport-toggle">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => onLoopChange(e.target.checked)}
          />
          Loop
        </label>
        <button
          type="button"
          className="transport-btn transport-btn--export"
          disabled={!canExport || exporting || recording || pending}
          onClick={onExport}
        >
          {exporting ? 'Exporting…' : 'Export mix'}
        </button>
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
          Output level
        </span>
      </label>
    </header>
  );
}
