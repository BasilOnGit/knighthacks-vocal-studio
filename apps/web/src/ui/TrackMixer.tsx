import { ICON_SIZE, ICON_STROKE, Volume2, VolumeX } from './icons';

export type Mix = { db: number; muted: boolean; solo: boolean };

function formatDb(db: number): string {
  const rounded = Math.round(db);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function TrackMixer({
  tracks,
  mixes,
  onChange,
  onBeforeChange,
}: {
  tracks: { id: string; name: string }[];
  mixes: Record<string, Mix>;
  onChange: (id: string, mix: Mix) => void;
  onBeforeChange?: () => void;
}) {
  return (
    <section className="mixer" aria-label="Track mixer">
      <div className="mixer-strips" role="list">
        {tracks.map((track) => {
          const mix = mixes[track.id] ?? { db: 0, muted: false, solo: false };
          const stripClass = [
            'mixer-strip',
            mix.muted ? 'mixer-strip--muted' : '',
            mix.solo ? 'mixer-strip--solo' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <article key={track.id} className={stripClass} role="listitem" aria-label={track.name}>
              <div className="mixer-strip-header">
                <span className="mixer-strip-name">{track.name}</span>
              </div>
              <div className="mixer-strip-controls">
                <button
                  type="button"
                  className="mixer-btn mixer-btn--mute"
                  aria-label={`Mute ${track.name}`}
                  aria-pressed={mix.muted}
                  title={mix.muted ? 'Unmute' : 'Mute'}
                  onClick={() => {
                    onBeforeChange?.();
                    onChange(track.id, { ...mix, muted: !mix.muted });
                  }}
                >
                  {mix.muted ? (
                    <VolumeX size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                  ) : (
                    <Volume2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="mixer-btn mixer-btn--solo"
                  aria-label={`Solo ${track.name}`}
                  aria-pressed={mix.solo}
                  title={mix.solo ? 'Unsolo' : 'Solo'}
                  onClick={() => {
                    onBeforeChange?.();
                    onChange(track.id, { ...mix, solo: !mix.solo });
                  }}
                >
                  S
                </button>
              </div>
              <label className="mixer-strip-volume">
                <span className="mixer-strip-volume-label">{formatDb(mix.db)} dB</span>
                <input
                  className="studio-range"
                  aria-label={`${track.name} volume`}
                  type="range"
                  min={-36}
                  max={6}
                  step={1}
                  value={mix.db}
                  onPointerDown={() => onBeforeChange?.()}
                  onChange={(e) => onChange(track.id, { ...mix, db: Number(e.target.value) })}
                />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
