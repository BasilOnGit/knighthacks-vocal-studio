export type Mix = { db: number; muted: boolean; solo: boolean };
export function TrackMixer({ tracks, mixes, onChange }: {
 tracks: { id: string; name: string }[]; mixes: Record<string, Mix>;
 onChange: (id: string, mix: Mix) => void;
}) {
 return <section className="mixer"><div className="section-heading"><h2>Track mixer</h2><span>Balance your session</span></div><div className="mixer-strips">{tracks.map(track=>{
 const mix = mixes[track.id] ?? {db:0,muted:false,solo:false};
 return <div className="mixer-strip" key={track.id}><strong>{track.name}</strong><div className="mix-buttons"><button type="button" aria-label={`Mute ${track.name}`} aria-pressed={mix.muted} onClick={()=>onChange(track.id,{...mix,muted:!mix.muted})}>M</button><button type="button" aria-label={`Solo ${track.name}`} aria-pressed={mix.solo} onClick={()=>onChange(track.id,{...mix,solo:!mix.solo})}>S</button></div><label>Volume <input aria-label={`${track.name} volume`} type="range" min={-36} max={6} step={1} value={mix.db} onChange={e=>onChange(track.id,{...mix,db:Number(e.target.value)})}/><span>{mix.db} dB</span></label></div>;
 })}</div></section>;
}
