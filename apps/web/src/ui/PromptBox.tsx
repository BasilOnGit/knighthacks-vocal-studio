import React, { type FormEvent } from 'react';
const STYLES: Record<string,string> = {
 'Warm R&B': 'Warm, intimate R&B vocals with gentle compression and a short reverb.',
 'Dream pop': 'Dreamy, spacious vocals with airy EQ, soft delay and lush reverb.',
 'Punchy rap': 'Punchy, upfront rap vocals with tight compression and subtle saturation.',
 'Lo-fi': 'Gritty lo-fi vocals with a darker tone and subtle distortion.',
 'Clean pop': 'Clear, bright pop vocals with balanced compression and a light room reverb.',
};
export function PromptBox({prompt,busy,hasTake,onPromptChange,onGenerate}: {
 prompt:string;busy:boolean;hasTake:boolean;onPromptChange:(value:string)=>void;onGenerate:(event:FormEvent)=>void;
}) {
 const [space,setSpace]=React.useState('');
 return <form className="prompt-form" onSubmit={onGenerate}><div className="section-heading"><div><span className="eyebrow">YOUR SOUND, IN WORDS</span><h2>Shape your vocal</h2></div><span className="status-pill">{hasTake?'Take ready':'Record a take first'}</span></div>
 <div className="style-chips" aria-label="Style suggestions">{Object.entries(STYLES).map(([name,text])=><button key={name} type="button" disabled={busy} onClick={()=>{setSpace('');onPromptChange(text);}}>{name}</button>)}</div>
 <label htmlFor="prompt">Describe the sound you want</label><textarea id="prompt" maxLength={1000} value={prompt} onChange={e=>onPromptChange(e.target.value)} placeholder="Try: intimate vocals, a warm tone, and a soft echo…" required/>
 <div className="prompt-bottom"><label>Space<select value={space} disabled={busy} onChange={e=>{
 const next=e.target.value;setSpace(next);const base=prompt.replace(/\nSpace preference:.*$/,'');onPromptChange((base+(next?'\nSpace preference: '+next+'.':'')).slice(0,1000));
 }}><option value="">Choose an ambience</option><option>Dry and close</option><option>Small room</option><option>Wide and spacious</option></select></label><small>{prompt.length}/1000</small><button className="generate-button" disabled={busy||!hasTake||!prompt.trim()}>{busy?'Finding your sound…':'Generate vocal preset ↗'}</button></div>
 <p className="input-help">{hasTake?'Your voice measurements help tailor the preset. You can fine-tune every effect afterward.':'Record a vocal using the red Record button, then choose a style or write your own.'}</p></form>;
}
