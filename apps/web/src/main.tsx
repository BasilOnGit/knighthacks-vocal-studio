import React from 'react';
import * as Tone from 'tone';
import {createRoot} from 'react-dom/client';
import {preloadNoiseGateWorklet} from './audio/noiseGate';
import {preloadAutotuneMonitorWorklet} from './audio/autotuneMonitor';
import {preloadFormantAutotuneWorklet} from './audio/formantAutotune';
import {TimelineScale} from './session/TimelineScale';
import {anchorForTimelineStart} from './audio/clipEditing';
import {decodeAudioFile,AUDIO_FILE_ACCEPT} from './audio/decodeAudioFile';
import {clipTimelineStartSec,clipTimelineEndSec} from './session/clip';
import {newSnippet,overlapRows,deleteSnippet,restoreDeletedClip,ignoresDeleteShortcut,type Snippet,type SessionTrack} from './session/snippets';
import {computeTimelineDurationSec} from './session/timeline';
import {SessionEngine} from './engine/SessionEngine';
import {Recorder} from './engine/recorder';
import {TopBar} from './ui/TopBar';
import {InputPanel} from './ui/InputPanel';
import {TrackMixer,type Mix} from './ui/TrackMixer';
import {TimelineRuler} from './ui/TimelineRuler';
import {TimelinePlayhead} from './ui/TimelinePlayhead';
import {TrimWaveViewport} from './ui/TrimWaveViewport';
import {EffectsPanel} from './ui/EffectsPanel';
import {SavedPresetsPanel} from './ui/SavedPresetsPanel';
import {
  loadSavedPresetsFromSession,
  MAX_SAVED_PRESETS,
  persistSavedPresetsToSession,
  presetForApply,
  snapshotPreset,
  type SavedPreset,
} from './session/savedPresets';
import {PromptBox} from './ui/PromptBox';
import {FeatureList} from './ui/FeatureList';
import {analyze,featureWarnings} from './analysis/analyze';
import {defaultParams,FIXED_ORDER} from '../../../shared/params';
import {validatePreset} from '../../../shared/validate';
import type {EffectType,Preset} from '../../../shared/types';
import './style.css';
const MAX_TRACKS=12;
const MAX_UNDO_DELETES=20;
type ClipDeleteUndo={snippet:Snippet;source?:string;generated?:Preset};
function App(){
 const [tracks,setTracks]=React.useState<SessionTrack[]>([{id:'beat',name:'Beat'},{id:'vocal',name:'Vocal'}]);
 const [clips,setClips]=React.useState<Snippet[]>([]);
 const [selectedId,setSelectedId]=React.useState<string|null>(null);
 const [armedId,setArmedId]=React.useState('vocal');
 const [panel,setPanel]=React.useState<'clip'|'effects'|'ai'>('clip');
 const [mobileView,setMobileView]=React.useState<'timeline'|'inspector'|'mixer'>('timeline');
 const [mixes,setMixes]=React.useState<Record<string,Mix>>({});
 const [deviceId,setDeviceId]=React.useState('');const [zoom,setZoom]=React.useState(40);
 const [playing,setPlaying]=React.useState(false);const [recording,setRecording]=React.useState(false);
 const [position,setPosition]=React.useState(0);const [recordElapsed,setRecordElapsed]=React.useState(0);
 const [masterDb,setMasterDb]=React.useState(0);const [dry,setDry]=React.useState(false);
 const [prompt,setPrompt]=React.useState('');const [generating,setGenerating]=React.useState(false);
 const [error,setError]=React.useState('');const [importing,setImporting]=React.useState<string|null>(null);
 const [recordPending,setRecordPending]=React.useState(false);
 const [sources,setSources]=React.useState<Record<string,string>>({});const [generated,setGenerated]=React.useState<Record<string,Preset>>({});
 const [savedPresets,setSavedPresets]=React.useState<SavedPreset[]>(()=>loadSavedPresetsFromSession());
 const [deleteUndoStack,setDeleteUndoStack]=React.useState<ClipDeleteUndo[]>([]);
 const engineRef=React.useRef<SessionEngine|null>(null);const recorderRef=React.useRef<Recorder|null>(null);
 const recordLock=React.useRef(false);const generationLock=React.useRef(false);
 const recordTarget=React.useRef<{trackId:string;start:number;perf:number}|null>(null);
 const recordingRef=React.useRef(false);
 const fileInput=React.useRef<HTMLInputElement>(null);const importTarget=React.useRef('beat');
 const selected=clips.find(c=>c.id===selectedId)??null;
 React.useEffect(()=>{recordingRef.current=recording;},[recording]);
 React.useEffect(()=>{persistSavedPresetsToSession(savedPresets);},[savedPresets]);
 React.useEffect(()=>{const engine=new SessionEngine(()=>{setPlaying(false);if(!recordingRef.current)setPosition(0);});engineRef.current=engine;recorderRef.current=new Recorder();const bootAudio=()=>{void Tone.start().then(()=>Promise.all([preloadNoiseGateWorklet(),preloadAutotuneMonitorWorklet(),preloadFormantAutotuneWorklet()])).catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)));};window.addEventListener('pointerdown',bootAudio,{once:true});return()=>{window.removeEventListener('pointerdown',bootAudio);engine.dispose();engineRef.current=null;};},[]);
 React.useEffect(()=>{
  engineRef.current?.sync(clips);
  const recordTrackId=recording?recordTarget.current?.trackId??null:null;
  const effectiveMixes=recordTrackId?{...mixes,[recordTrackId]:{...(mixes[recordTrackId]??{db:0,muted:false,solo:false}),muted:true,solo:false}}:mixes;
  engineRef.current?.setMixes(effectiveMixes,tracks.map(t=>t.id));
 },[clips,mixes,tracks,recording]);
 React.useEffect(()=>{engineRef.current?.setMasterGain(masterDb);},[masterDb]);
 React.useEffect(()=>{engineRef.current?.setBypass(dry);},[dry]);
 React.useEffect(()=>{
  if(!playing&&!recording)return;
  let frame=0;function tick(){if(recording&&recordTarget.current){const elapsed=(performance.now()-recordTarget.current.perf)/1000;setRecordElapsed(elapsed);setPosition(recordTarget.current.start+elapsed);}else setPosition(engineRef.current?.getSeconds()??0);frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,recording]);
 function stopPlayback(reset=false){engineRef.current?.stop();setPlaying(false);if(reset)setPosition(0);}
 function updateClip(id:string,patch:Partial<Snippet>,structural=false){if(recording||recordPending)return;if(structural)stopPlayback();setClips(current=>current.map(c=>c.id===id?{...c,...patch}:c));}
 const removeSelected=React.useCallback(()=>{if(!selectedId||recording||recordPending)return;const snippet=clips.find(c=>c.id===selectedId);if(!snippet)return;engineRef.current?.stop();setPlaying(false);setDeleteUndoStack(stack=>[{snippet,source:sources[selectedId],generated:generated[selectedId]},...stack].slice(0,MAX_UNDO_DELETES));setClips(current=>deleteSnippet(current,selectedId));setSelectedId(null);setSources(current=>{const next={...current};delete next[selectedId];return next;});setGenerated(current=>{const next={...current};delete next[selectedId];return next;});},[selectedId,recording,recordPending,clips,sources,generated]);
 const undoDelete=React.useCallback(()=>{if(recording||recordPending||deleteUndoStack.length===0)return;const [entry,...rest]=deleteUndoStack;const {snippet,source,generated:generatedPreset}=entry;setDeleteUndoStack(rest);stopPlayback();setClips(current=>restoreDeletedClip(current,snippet));setSelectedId(snippet.id);if(source!==undefined)setSources(current=>({...current,[snippet.id]:source}));if(generatedPreset!==undefined)setGenerated(current=>({...current,[snippet.id]:structuredClone(generatedPreset)}));},[deleteUndoStack,recording,recordPending]);
 React.useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(ignoresDeleteShortcut(event.target)||recording||recordPending)return;if((event.key==='Backspace'||event.key==='Delete')&&selectedId){event.preventDefault();removeSelected();return;}if((event.key==='z'||event.key==='Z')&&(event.metaKey||event.ctrlKey)&&!event.shiftKey){event.preventDefault();undoDelete();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[selectedId,recording,recordPending,removeSelected,undoDelete]);
 const features=React.useMemo(()=>selected?analyze(selected.buffer,selected.trim.start,selected.trim.end):null,[selected?.buffer,selected?.trim.start,selected?.trim.end]);
 const monitorAutotune=React.useMemo(()=>{const node=selected?.preset.chain.find(n=>n.type==='autotune'&&n.enabled);if(!node||(node.params.mix??0)<=0)return null;return node.params;},[selected?.preset]);
 function hasBackingClipsAt(trackId:string,at:number){return clips.some(c=>c.trackId!==trackId&&clipTimelineEndSec(c)>at);}
 async function startRecord(trackId=armedId){
  if(recordLock.current||recording)return;recordLock.current=true;setRecordPending(true);setError('');
  const wasPlaying=playing;
  const at=wasPlaying?(engineRef.current?.getSeconds()??position):position;
  if(!wasPlaying)stopPlayback();
  setPosition(at);setArmedId(trackId);
  try{
   await recorderRef.current!.start(deviceId);
   recordTarget.current={trackId,start:at,perf:performance.now()};
   setRecordElapsed(0);setRecording(true);
   if(!wasPlaying&&hasBackingClipsAt(trackId,at)){
    const started=await engineRef.current?.play(at);
    setPlaying(!!started);
   }
  }catch(e){setError(e instanceof Error?e.message:'Could not start recording.');}finally{recordLock.current=false;setRecordPending(false);}
 }
 async function stopRecord(){if(recordLock.current||!recording)return;recordLock.current=true;setRecordPending(true);const target=recordTarget.current;
  try{const buffer=await recorderRef.current!.stop();if(target){const clip=newSnippet(buffer,`Take ${clips.filter(c=>c.trackId===target.trackId).length+1}`,target.trackId,target.start);setClips(current=>[...current,clip]);setSelectedId(clip.id);setPosition(target.start+buffer.duration);}}catch(e){setError(e instanceof Error?e.message:'Recording failed.');}finally{recordTarget.current=null;setRecording(false);setRecordElapsed(0);stopPlayback();recordLock.current=false;setRecordPending(false);}
 }
 async function importFiles(files:File[],trackId:string){
  if(recording)return;setImporting(trackId);setError('');const at=position;stopPlayback();
  try{const imported=await Promise.all(files.map(async file=>newSnippet(await decodeAudioFile(file),file.name,trackId,at)));setClips(current=>[...current,...imported]);setSelectedId(imported[0]?.id??null);}catch(e){setError(e instanceof Error?e.message:'Could not import audio.');}finally{setImporting(null);}
 }
 function chooseImport(trackId:string){importTarget.current=trackId;fileInput.current?.click();}
 function addTrack(){if(tracks.length>=MAX_TRACKS)return;const track={id:crypto.randomUUID(),name:`Track ${tracks.length+1}`};setTracks(current=>[...current,track]);setArmedId(track.id);}
 function removeTrack(id:string){if(recording||recordPending||importing)return;stopPlayback();setTracks(current=>current.filter(t=>t.id!==id));setClips(current=>current.filter(c=>c.trackId!==id));if(clips.find(c=>c.id===selectedId)?.trackId===id)setSelectedId(null);if(armedId===id)setArmedId('vocal');}
 async function play(){if(recording||!clips.length)return;setError('');try{const started=await engineRef.current?.play(position);setPlaying(!!started);}catch(e){setPlaying(false);setError('Unable to start audio playback. Try Play again.');}}
 function seek(sec:number){if(recording)return;const next=Math.max(0,sec);setPosition(next);if(playing)void engineRef.current?.play(next).catch(()=>{setPlaying(false);setError('Playback failed.');});}
 function setSelectedPreset(preset:Preset){if(!selected)return;const oldKey=selected.preset.chain.map(n=>n.id+':'+n.type).join('|');const newKey=preset.chain.map(n=>n.id+':'+n.type).join('|');updateClip(selected.id,{preset},oldKey!==newKey);setSources(current=>({...current,[selected.id]:'manual'}));}
 function savePresetToSession(name:string){if(!selected||recording||recordPending)return;const preset=snapshotPreset(selected.preset);const label=name.trim()||preset.name||'Saved preset';setSavedPresets(current=>[{id:crypto.randomUUID(),name:label,preset,savedAt:Date.now()},...current].slice(0,MAX_SAVED_PRESETS));}
 function applySavedPreset(id:string){if(!selected||recording||recordPending)return;const entry=savedPresets.find(p=>p.id===id);if(!entry)return;setSelectedPreset(presetForApply(entry.preset));}
 function removeSavedPreset(id:string){setSavedPresets(current=>current.filter(p=>p.id!==id));}
 function addEffect(type:EffectType){if(!selected||selected.preset.chain.some(n=>n.type===type))return;const next={...selected.preset,chain:[...selected.preset.chain,{id:crypto.randomUUID(),type,enabled:true,params:defaultParams(type)}]};next.chain.sort((a,b)=>FIXED_ORDER.indexOf(a.type)-FIXED_ORDER.indexOf(b.type));setSelectedPreset(next);}
 async function generate(event:React.FormEvent){event.preventDefault();if(!selected||!features||!prompt.trim()||generationLock.current)return;const id=selected.id;generationLock.current=true;setGenerating(true);setError('');
  try{const response=await fetch('/api/presets/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.trim(),features})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.preset)throw new Error(data?.error??'Preset generation failed. Check that the API server is running.');const preset=validatePreset(data.preset);stopPlayback();setClips(current=>current.map(c=>c.id===id?{...c,preset}:c));setGenerated(current=>({...current,[id]:structuredClone(preset)}));setSources(current=>({...current,[id]:data.source??'model'}));}catch(e){setError(e instanceof Error?e.message:'Preset generation failed.');}finally{generationLock.current=false;setGenerating(false);}
 }
 const timelineDuration=computeTimelineDurationSec([...clips.map(clipTimelineEndSec),recordTarget.current?recordTarget.current.start+recordElapsed:0]);
 return <TimelineScale.Provider value={zoom}><div className="daw" style={{'--px-per-sec':`${zoom}px`} as React.CSSProperties}>
  <div className="studio-heading"><span className="eyebrow">VOCAL STUDIO / SESSION 01</span><span className="session-local">● Browser-local audio</span></div>
  <TopBar playing={playing} recording={recording} pending={recordPending} canPlay={clips.length>0&&!recordPending} positionSec={position} dry={dry} masterDb={masterDb} onPlay={()=>void play()} onRecord={()=>void startRecord()} onStop={()=>recording?void stopRecord():stopPlayback(true)} onDryChange={setDry} onMasterDbChange={setMasterDb}/>
  <InputPanel deviceId={deviceId} onDeviceChange={setDeviceId} recording={recording||recordPending} monitorAutotune={monitorAutotune}/>
  <div className="session-toolbar"><label>Record into <select value={armedId} disabled={recording||recordPending} onChange={e=>setArmedId(e.target.value)}>{tracks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><span>{recordPending?'Preparing audio…':recording?'Recording — Stop to keep this take':'New takes are added at the playhead. Existing clips stay in place.'}</span></div>
  {error&&<p className="session-error" role="alert">{error}</p>}
  <input ref={fileInput} type="file" multiple accept={AUDIO_FILE_ACCEPT} hidden onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)void importFiles(files,importTarget.current);}}/>
  <nav className="mobile-studio-nav" aria-label="Studio view">{(['timeline','inspector','mixer'] as const).map(view=><button key={view} type="button" aria-pressed={mobileView===view} onClick={()=>setMobileView(view)}>{view==='timeline'?'Tracks':view==='inspector'?'Clip & effects':'Mixer'}</button>)}</nav>
  <div className={`studio-work-area mobile-view-${mobileView}`}>
  <div className="daw-arrangement"><div className="arrangement-h-scroll"><div className="arrangement-canvas" style={{'--timeline-sec':timelineDuration} as React.CSSProperties}>
   <TimelineRuler durationSec={timelineDuration} seekDisabled={recording||recordPending} onSeek={seek}/>
   {tracks.map(track=>{const layout=overlapRows(clips.filter(c=>c.trackId===track.id));const isRecording=recording&&recordTarget.current?.trackId===track.id;
    return <section key={track.id} className="track-lane snippet-lane" aria-label={`${track.name} track`}>
     <div className="track-lane-header"><input className="track-name-input" aria-label={`Rename ${track.name}`} value={track.name} maxLength={40} disabled={recording} onChange={e=>setTracks(current=>current.map(t=>t.id===track.id?{...t,name:e.target.value}:t))}/><span className="track-lane-meta">{layout.clips.length} clip{layout.clips.length===1?'':'s'}</span>
      <div className="track-lane-actions"><button type="button" className="track-record-button" disabled={recording||recordPending} onClick={()=>void startRecord(track.id)}>● Record</button><button type="button" disabled={!!importing||recording||recordPending} onClick={()=>chooseImport(track.id)}>{importing===track.id?'Loading…':'Import'}</button>{!['beat','vocal'].includes(track.id)&&<button type="button" disabled={recording||recordPending||!!importing} onClick={()=>removeTrack(track.id)}>Remove track</button>}</div><button className="arm-track" type="button" aria-pressed={armedId===track.id} disabled={recording||recordPending} onClick={()=>setArmedId(track.id)}>{armedId===track.id?'Recording target':'Set recording target'}</button>
     </div>
     <div className="track-lane-clip track-lane-clip--timeline"><div className="track-timeline-body snippet-body" style={{width:timelineDuration*zoom,height:Math.max(layout.rowCount+(isRecording?1:0),1)*104,minHeight:104}}>
      {layout.clips.map(({clip,row})=><div key={clip.id} className={`timeline-clip snippet-clip timeline-clip--audio${selectedId===clip.id?' snippet-selected':''}${clip.muted?' snippet-muted':''}`} style={{left:clipTimelineStartSec(clip)*zoom,width:Math.max(4,(clip.trim.end-clip.trim.start)*zoom),top:row*104+6,height:90,bottom:'auto'}} onPointerDownCapture={()=>{if(!recording)setSelectedId(clip.id);}}>
       <button type="button" className="snippet-title" aria-label={`Select ${clip.name}`} onClick={()=>setSelectedId(clip.id)}>{clip.name}</button>
       <div className="snippet-wave"><TrimWaveViewport buffer={clip.buffer} trim={clip.trim} timelineStartSec={clipTimelineStartSec(clip)} onTrimChange={trim=>updateClip(clip.id,{trim},true)} onTimelineStartChange={start=>updateClip(clip.id,{clipStartSec:anchorForTimelineStart(start,clip.trim)},true)}/></div>
      </div>)}
      {isRecording&&<div className="timeline-clip timeline-clip--recording" style={{left:(recordTarget.current?.start??0)*zoom,width:Math.max(4,recordElapsed*zoom),top:layout.rowCount*104+6,height:90,bottom:'auto'}}><span className="recording-label">Recording {recordElapsed.toFixed(1)}s</span></div>}
      {!layout.clips.length&&!isRecording&&<p className="timeline-empty-hint">Record or import audio · multiple clips can overlap</p>}
     </div></div>
    </section>;
   })}
   <TimelinePlayhead positionSec={position} durationSec={timelineDuration} disabled={recording||recordPending} onPositionChange={seek}/>
  </div></div><div className="arrangement-toolbar"><button type="button" className="arrangement-add-track" disabled={tracks.length>=MAX_TRACKS||recording||recordPending} onClick={addTrack}>Add track</button><button type="button" className="undo-snippet" disabled={deleteUndoStack.length===0||recording||recordPending} onClick={undoDelete}>Undo delete <kbd>⌘Z</kbd></button><button type="button" className="delete-snippet" disabled={!selected||recording||recordPending} onClick={removeSelected}>Delete clip <kbd>⌫</kbd></button><label className="timeline-zoom">Timeline zoom <input aria-label="Timeline zoom" type="range" min={20} max={120} step={10} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><span className="arrangement-cap-hint">Select a clip · Backspace/Delete removes it · Undo restores the last deleted clip</span></div></div>
  <aside className="sound-workspace" aria-label="Sound inspector">
   <div className="inspector-tabs" role="tablist" aria-label="Clip tools">{(['clip','effects','ai'] as const).map(tab=><button key={tab} id={`tab-${tab}`} type="button" role="tab" aria-selected={panel===tab} aria-controls={`panel-${tab}`} tabIndex={panel===tab?0:-1} onClick={()=>setPanel(tab)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const tabs=['clip','effects','ai'] as const;const next=tabs[(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:2))%3];setPanel(next);document.getElementById(`tab-${next}`)?.focus();}}}>{tab==='clip'?'Clip':tab==='effects'?'Effects':'AI preset'}</button>)}</div>
   <div className="inspector-content">
   <section className="daw-rack" hidden={panel==='ai'}>
   <div className="section-heading"><h2>Clip inspector</h2><span>{selected?tracks.find(t=>t.id===selected.trackId)?.name:'Select a snippet'}</span></div>
   {selected?<><div id="panel-clip" role="tabpanel" aria-labelledby="tab-clip" hidden={panel!=='clip'}><label className="clip-name">Clip name<input maxLength={80} value={selected.name} disabled={recording} onChange={e=>updateClip(selected.id,{name:e.target.value})}/></label><div className="clip-settings">
    <label>Volume · {selected.volumeDb} dB<input aria-label="Clip volume" type="range" min={-36} max={12} value={selected.volumeDb} onChange={e=>updateClip(selected.id,{volumeDb:Number(e.target.value)})}/></label>
    <label>Pan · {selected.pan===0?'Center':selected.pan<0?'Left':'Right'}<input aria-label="Clip pan" type="range" min={-1} max={1} step={.05} value={selected.pan} onChange={e=>updateClip(selected.id,{pan:Number(e.target.value)})}/></label>
    <label>Fade in · {selected.fadeIn.toFixed(2)}s<input aria-label="Clip fade in" type="range" min={0} max={Math.min(5,(selected.trim.end-selected.trim.start)/2)} step={.01} value={Math.min(selected.fadeIn,(selected.trim.end-selected.trim.start)/2)} onChange={e=>updateClip(selected.id,{fadeIn:Number(e.target.value)},true)}/></label>
    <label>Fade out · {selected.fadeOut.toFixed(2)}s<input aria-label="Clip fade out" type="range" min={0} max={Math.min(5,(selected.trim.end-selected.trim.start)/2)} step={.01} value={Math.min(selected.fadeOut,(selected.trim.end-selected.trim.start)/2)} onChange={e=>updateClip(selected.id,{fadeOut:Number(e.target.value)},true)}/></label>
   </div><label className="monitor-switch"><input type="checkbox" checked={selected.muted} onChange={e=>updateClip(selected.id,{muted:e.target.checked})}/> Mute this clip</label>
   <details className="voice-details"><summary>Voice measurements</summary>{features&&<FeatureList features={features} warnings={featureWarnings(features)}/>}</details>
   <p className="clip-location">{clipTimelineStartSec(selected).toFixed(2)}s on timeline · {(selected.trim.end-selected.trim.start).toFixed(2)}s long</p>
   <button className="inspector-delete" type="button" disabled={recording||recordPending} onClick={removeSelected}>Delete selected clip <kbd>⌫</kbd></button>
   </div><div id="panel-effects" role="tabpanel" aria-labelledby="tab-effects" hidden={panel!=='effects'}>
   <h2 className="section-title">Effects for this clip</h2><div className="effect-picker">{FIXED_ORDER.map(type=><button key={type} type="button" disabled={recording||selected.preset.chain.some(n=>n.type===type)} onClick={()=>addEffect(type)}>+ {type}</button>)}</div>
   {selected.preset.chain.length>0&&<EffectsPanel compact preset={selected.preset} source={sources[selected.id]??'manual'} onParamChange={(id,key,value)=>setSelectedPreset({...selected.preset,chain:selected.preset.chain.map(n=>n.id===id?{...n,params:{...n.params,[key]:value}}:n)})} onEnabledChange={(id,enabled)=>setSelectedPreset({...selected.preset,chain:selected.preset.chain.map(n=>n.id===id?{...n,enabled}:n)})} onRemove={id=>setSelectedPreset({...selected.preset,chain:selected.preset.chain.filter(n=>n.id!==id)})} onReset={generated[selected.id]?()=>setSelectedPreset(structuredClone(generated[selected.id])):undefined}/>}
   <SavedPresetsPanel disabled={recording||recordPending} currentPresetName={selected.preset.name} savedPresets={savedPresets} onSave={savePresetToSession} onApply={applySavedPreset} onRemove={removeSavedPreset}/>
   </div>
   </>:<p className="input-help">Click a clip in the timeline to edit its sound. Each snippet has its own settings and effect chain.</p>}
  </section><section className="daw-prompt" id="panel-ai" role="tabpanel" aria-labelledby="tab-ai" hidden={panel!=='ai'}><PromptBox prompt={prompt} busy={generating||recording} hasTake={!!selected} onPromptChange={setPrompt} onGenerate={generate}/></section></div></aside>
  <div className="studio-mixer"><TrackMixer tracks={tracks} mixes={mixes} onChange={(id,mix)=>setMixes(current=>({...current,[id]:mix}))}/></div>
  </div>
  <footer className="studio-status"><span>{recording?'● Recording':playing?'▶ Playing':selected?`Selected: ${selected.name}`:'Ready'}</span><span>{tracks.length} tracks · {clips.length} clips</span></footer>
 </div></TimelineScale.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
