type TopBarProps = {
  playing: boolean;
  canPlay: boolean;
  timeLabel: string;
  dry: boolean;
  masterDb: number;
  onPlayStop: () => void;
  onDryChange: (dry: boolean) => void;
  onMasterDbChange: (db: number) => void;
};

export function TopBar({
  playing,
  canPlay,
  timeLabel,
  dry,
  masterDb,
  onPlayStop,
  onDryChange,
  onMasterDbChange,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button type="button" onClick={onPlayStop} disabled={!playing && !canPlay}>
        {playing ? 'Stop' : 'Play'}
      </button>
      <span className="time" aria-label="Playback time">
        {timeLabel}
      </span>
      <label className="toggle">
        <input
          type="checkbox"
          checked={dry}
          onChange={(e) => onDryChange(e.target.checked)}
        />
        Dry
      </label>
      <label className="master">
        Master
        <input
          type="range"
          min={-24}
          max={6}
          step={1}
          value={masterDb}
          onChange={(e) => onMasterDbChange(Number(e.target.value))}
        />
        <span>{masterDb} dB</span>
      </label>
    </header>
  );
}
