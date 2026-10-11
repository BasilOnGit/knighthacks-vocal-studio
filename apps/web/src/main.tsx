import React from 'react';
import * as Tone from 'tone';
import {createRoot} from 'react-dom/client';
import {preloadNoiseGateWorklet} from './audio/noiseGate';
import {preloadDenoiseWorklet} from './audio/vocalDenoise';
import {preloadRiderWorklet} from './audio/vocalRider';
import {preloadAutotuneMonitorWorklet} from './audio/autotuneMonitor';
import {preloadFormantAutotuneWorklet} from './audio/formantAutotune';
import {TimelineScale} from './session/TimelineScale';
import {anchorForTimelineStart} from './audio/clipEditing';
import {decodeAudioFile,AUDIO_FILE_ACCEPT} from './audio/decodeAudioFile';
import {clipTimelineStartSec,clipTimelineEndSec} from './session/clip';
import {newSnippet,newSessionTrack,overlapRows,deleteSnippet,ignoresGlobalShortcuts,emptyTrackPreset,type Snippet,type SessionTrack} from './session/snippets';
import {MAX_SESSION_UNDO,captureSessionUndoSnapshot,type SessionUndoSnapshot} from './session/sessionUndo';
import {featureClipForTrack} from './session/featureClipForTrack';
import {moveChainNode} from './session/chainOrder';
import {appendAiTurn,clearAiThread,historyForApi,type AiThreadState} from './session/aiThread';
import {defaultStudioTracks,eraseStudioProject,loadStudioSession,persistStudioSession} from './session/studioPersistence';
import {MAX_STUDIO_PROJECTS,createStudioProject,listProjects,readProjectsState,removeStudioProjectFromIndex,renameStudioProject,setActiveProjectId,touchStudioProject,type StudioProjectMeta} from './session/studioProjects';
import {summarizePresetChanges} from './session/presetDiff';
import {otherTracksForGenerateApi} from './session/otherTracksForApi';
import {exportTimelineWav} from './audio/exportTimeline';
import {computeTimelineDurationSec} from './session/timeline';
import {SessionEngine} from './engine/SessionEngine';
import {Recorder} from './engine/recorder';
import {TopBar} from './ui/TopBar';
import {InputPanel} from './ui/InputPanel';
import {TrackMixer,type Mix} from './ui/TrackMixer';
import {TimelineRuler} from './ui/TimelineRuler';
import {TimelinePlayhead} from './ui/TimelinePlayhead';
import {usePlayheadTransport} from './hooks/usePlayheadTransport';
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
import {InspectorEmpty} from './ui/InspectorSection';
import {ToggleButton} from './ui/ToggleButton';
import {AudioWaveform,ICON_SIZE,ICON_STROKE,Redo2,SlidersHorizontal,Trash2,Undo2,Upload,VolumeX,Wand2} from './ui/icons';
import {FeatureList} from './ui/FeatureList';
import {featureWarnings} from './analysis/analyze';
import {useVoiceFeatures} from './hooks/useVoiceFeatures';
import type {AiTurn} from './session/aiThread';
import {autotuneParamsFromFeatures,stampPresetFromFeatures} from './analysis/stampFeatures';
import {applyAiEffectWhys} from './session/aiEffectWhy';
import {effectDisplayName} from '../../../shared/effectLabels';
import {defaultParams,EFFECT_CATALOG} from '../../../shared/params';
import {normalizeAutotuneMixParams} from '../../../shared/effectMixPolicy';
import {validatePreset} from '../../../shared/validate';
import type {EffectType,Preset} from '../../../shared/types';
import './style.css';
const MAX_TRACKS=12;
const RECORD_DOUBLE_TAP_MS=400;
const EMPTY_AI_THREAD: AiTurn[]=[];
function App(){
 const [tracks,setTracks]=React.useState<SessionTrack[]>(defaultStudioTracks);
 const [sessionReady,setSessionReady]=React.useState(false);
 const [projects,setProjects]=React.useState<StudioProjectMeta[]>([]);
 const [projectId,setProjectId]=React.useState<string|null>(null);
 const [projectSwitching,setProjectSwitching]=React.useState(false);
 const [clips,setClips]=React.useState<Snippet[]>([]);
 const [selectedId,setSelectedId]=React.useState<string|null>(null);
 const [selectedTrackId,setSelectedTrackId]=React.useState<string|null>('vocal');
 const [armedId,setArmedId]=React.useState('vocal');
 const [panel,setPanel]=React.useState<'clip'|'effects'|'ai'>('clip');
 const [mobileView,setMobileView]=React.useState<'timeline'|'inspector'|'mixer'>('timeline');
 const [mixes,setMixes]=React.useState<Record<string,Mix>>({});
 const [deviceId,setDeviceId]=React.useState('');const [zoom,setZoom]=React.useState(40);
 const [playing,setPlaying]=React.useState(false);const [recording,setRecording]=React.useState(false);
 const [recordElapsed,setRecordElapsed]=React.useState(0);
 const [masterDb,setMasterDb]=React.useState(0);const [dry,setDry]=React.useState(false);const [loop,setLoop]=React.useState(false);
 const [exporting,setExporting]=React.useState(false);
 const [prompt,setPrompt]=React.useState('');const [generating,setGenerating]=React.useState(false);
 const [error,setError]=React.useState('');const [importing,setImporting]=React.useState<string|null>(null);
 const [recordPending,setRecordPending]=React.useState(false);
 const [trackSources,setTrackSources]=React.useState<Record<string,string>>({});
 const [trackGenerated,setTrackGenerated]=React.useState<Record<string,Preset>>({});
 const [generateSummary,setGenerateSummary]=React.useState<string[]|null>(null);
 const [savedPresets,setSavedPresets]=React.useState<SavedPreset[]>(()=>loadSavedPresetsFromSession());
 const [undoStack,setUndoStack]=React.useState<SessionUndoSnapshot[]>([]);
 const [redoStack,setRedoStack]=React.useState<SessionUndoSnapshot[]>([]);
 const [aiThreads,setAiThreads]=React.useState<AiThreadState>({});
 const [clipDragId,setClipDragId]=React.useState<string|null>(null);
 const [dropTargetTrackId,setDropTargetTrackId]=React.useState<string|null>(null);
 const engineRef=React.useRef<SessionEngine|null>(null);const recorderRef=React.useRef<Recorder|null>(null);
 const recordLock=React.useRef(false);const generationLock=React.useRef(false);
 const recordTarget=React.useRef<{trackId:string;start:number;perf:number}|null>(null);
 const recordTapRef=React.useRef(0);
 const recordingRef=React.useRef(false);
 const exportingRef=React.useRef(false);
 const loopRef=React.useRef(loop);
 const sessionUndoRef=React.useRef({clips,tracks,mixes,trackSources,selectedId,selectedTrackId,armedId});
 const sessionPersistRef=React.useRef({tracks,clips,mixes,trackSources,aiThreads});
 const clipNameUndoPushedRef=React.useRef(false);
 React.useEffect(()=>{loopRef.current=loop;},[loop]);
 React.useEffect(()=>{sessionUndoRef.current={clips,tracks,mixes,trackSources,selectedId,selectedTrackId,armedId};},[clips,tracks,mixes,trackSources,selectedId,selectedTrackId,armedId]);
 React.useEffect(()=>{sessionPersistRef.current={tracks,clips,mixes,trackSources,aiThreads};},[tracks,clips,mixes,trackSources,aiThreads]);
 const applyLoadedSession=React.useCallback((saved:Awaited<ReturnType<typeof loadStudioSession>>)=>{if(saved){setTracks(saved.tracks);setClips(saved.clips);setMixes(saved.mixes);setTrackSources(saved.trackSources);setAiThreads(saved.aiThreads);}else{setTracks(defaultStudioTracks());setClips([]);setMixes({});setTrackSources({});setAiThreads({});}setSelectedId(null);setSelectedTrackId('vocal');setArmedId('vocal');setUndoStack([]);setRedoStack([]);setTrackGenerated({});setGenerateSummary(null);setPrompt('');},[]);
 const pushUndo=React.useCallback(()=>{if(recording||recordPending)return;setRedoStack([]);setUndoStack(stack=>[captureSessionUndoSnapshot(sessionUndoRef.current),...stack].slice(0,MAX_SESSION_UNDO));},[recording,recordPending]);
 const fileInput=React.useRef<HTMLInputElement>(null);const importTarget=React.useRef('beat');
 const timelineDuration=computeTimelineDurationSec([...clips.map(clipTimelineEndSec),recordTarget.current?recordTarget.current.start+recordElapsed:0]);
 const transport=usePlayheadTransport({engineRef,timelineDurationSec:timelineDuration,playing,setPlaying,recording,recordPending});
 const transportRef=React.useRef(transport);
 transportRef.current=transport;
 const {positionSec,positionRef,scrubbingRef,applyPosition,seek,jumpTo,startEngineAt,stopPlayback,syncFromEngine}=transport;
 const applyUndoSnapshot=React.useCallback((snapshot:SessionUndoSnapshot)=>{stopPlayback();setClips(snapshot.clips);setTracks(snapshot.tracks);setMixes(snapshot.mixes);setTrackSources(snapshot.trackSources);setSelectedId(snapshot.selectedId);setSelectedTrackId(snapshot.selectedTrackId);setArmedId(snapshot.armedId);},[stopPlayback]);
 const undo=React.useCallback(()=>{if(recording||recordPending||undoStack.length===0)return;const current=captureSessionUndoSnapshot(sessionUndoRef.current);const [snapshot,...rest]=undoStack;setUndoStack(rest);setRedoStack(stack=>[current,...stack].slice(0,MAX_SESSION_UNDO));applyUndoSnapshot(snapshot);},[undoStack,recording,recordPending,applyUndoSnapshot]);
 const redo=React.useCallback(()=>{if(recording||recordPending||redoStack.length===0)return;const current=captureSessionUndoSnapshot(sessionUndoRef.current);const [snapshot,...rest]=redoStack;setRedoStack(rest);setUndoStack(stack=>[current,...stack].slice(0,MAX_SESSION_UNDO));applyUndoSnapshot(snapshot);},[redoStack,recording,recordPending,applyUndoSnapshot]);
 const selected=clips.find(c=>c.id===selectedId)??null;
 React.useEffect(()=>{recordingRef.current=recording;},[recording]);
 React.useEffect(()=>{persistSavedPresetsToSession(savedPresets);},[savedPresets]);
 React.useEffect(()=>{const boot=readProjectsState();setProjects(listProjects());setProjectId(boot.activeId);setActiveProjectId(boot.activeId);void loadStudioSession(boot.activeId).then(saved=>{if(saved){setTracks(saved.tracks);setClips(saved.clips);setMixes(saved.mixes);setTrackSources(saved.trackSources);setAiThreads(saved.aiThreads);setUndoStack([]);setRedoStack([]);}setSessionReady(true);}).catch(()=>setSessionReady(true));},[]);
 React.useEffect(()=>{if(!sessionReady||!projectId)return;const timer=setTimeout(()=>{void persistStudioSession(projectId,sessionPersistRef.current).then(()=>setProjects(touchStudioProject(projectId))).catch(()=>{});},400);return()=>clearTimeout(timer);},[sessionReady,projectId,tracks,clips,mixes,trackSources,aiThreads]);
 const selectProject=React.useCallback(async(id:string)=>{if(!projectId||id===projectId||recording||recordPending||projectSwitching)return;setProjectSwitching(true);setError('');stopPlayback();try{await persistStudioSession(projectId,sessionPersistRef.current);const saved=await loadStudioSession(id);setActiveProjectId(id);setProjectId(id);applyLoadedSession(saved);setProjects(listProjects());}catch(e){setError(e instanceof Error?e.message:'Could not open project.');}finally{setProjectSwitching(false);}},[projectId,recording,recordPending,projectSwitching,stopPlayback,applyLoadedSession]);
 const createProject=React.useCallback(async()=>{if(!projectId||recording||recordPending||projectSwitching)return;if(projects.length>=MAX_STUDIO_PROJECTS){setError(`You can save up to ${MAX_STUDIO_PROJECTS} projects in this browser.`);return;}setProjectSwitching(true);setError('');stopPlayback();try{await persistStudioSession(projectId,sessionPersistRef.current);const meta=createStudioProject(`Project ${projects.length+1}`);if(!meta)return;setProjectId(meta.id);applyLoadedSession(null);setProjects(listProjects());}catch(e){setError(e instanceof Error?e.message:'Could not create project.');}finally{setProjectSwitching(false);}},[projectId,projects.length,recording,recordPending,projectSwitching,stopPlayback,applyLoadedSession]);
 const renameProject=React.useCallback((id:string,name:string)=>{setProjects(renameStudioProject(id,name));},[]);
 const deleteProject=React.useCallback(async(id:string)=>{if(recording||recordPending||projectSwitching)return;if(projects.length<=1){setError('You need at least one project.');return;}const label=projects.find(p=>p.id===id)?.name??'this project';if(!window.confirm(`Delete "${label}"? Clips and settings for this project will be removed from this browser.`))return;setProjectSwitching(true);setError('');stopPlayback();try{await eraseStudioProject(id);const next=removeStudioProjectFromIndex(id);if(!next)return;if(id===projectId){setProjectId(next.activeId);const saved=await loadStudioSession(next.activeId);applyLoadedSession(saved);}setProjects(listProjects());}catch(e){setError(e instanceof Error?e.message:'Could not delete project.');}finally{setProjectSwitching(false);}},[projectId,projects,recording,recordPending,projectSwitching,stopPlayback,applyLoadedSession]);
 React.useEffect(()=>{const engine=new SessionEngine(()=>{if(exportingRef.current){transportRef.current?.onPlaybackEnded();return;}if(loopRef.current&&!recordingRef.current){void transportRef.current?.startEngineAt(0);return;}transportRef.current?.onPlaybackEnded();});engineRef.current=engine;recorderRef.current=new Recorder();const bootAudio=()=>{void Tone.start().then(()=>Promise.all([preloadNoiseGateWorklet(),preloadDenoiseWorklet(),preloadRiderWorklet(),preloadAutotuneMonitorWorklet(),preloadFormantAutotuneWorklet()])).then(()=>engineRef.current?.warmWorklets()).catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)));};window.addEventListener('pointerdown',bootAudio,{once:true});return()=>{window.removeEventListener('pointerdown',bootAudio);engine.dispose();engineRef.current=null;};},[]);
 const trackPresets=React.useMemo(()=>Object.fromEntries(tracks.map(t=>[t.id,t.preset])),[tracks]);
 React.useEffect(()=>{
  engineRef.current?.sync(clips,trackPresets);
 },[clips,trackPresets,tracks,recording]);
 React.useEffect(()=>{
  engineRef.current?.setMixes(mixes,tracks.map(t=>t.id));
 },[mixes,tracks]);
 React.useEffect(()=>{engineRef.current?.setMasterGain(masterDb);},[masterDb]);
 React.useEffect(()=>{engineRef.current?.setBypass(dry);},[dry]);
 React.useEffect(()=>{
  if(!playing&&!recording)return;
  let frame=0;
  function tick(){
   if(recording&&recordTarget.current){
    const elapsed=(performance.now()-recordTarget.current.perf)/1000;
    setRecordElapsed(elapsed);
    applyPosition(recordTarget.current.start+elapsed);
   }else if(playing&&!scrubbingRef.current){
    syncFromEngine();
   }
   frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[playing,recording,applyPosition,syncFromEngine,scrubbingRef]);
 function updateClip(id:string,patch:Partial<Snippet>,structural=false){if(recording||recordPending)return;if(structural)stopPlayback();setClips(current=>current.map(c=>c.id===id?{...c,...patch}:c));}
 const removeSelected=React.useCallback(()=>{if(!selectedId||recording||recordPending)return;if(!clips.find(c=>c.id===selectedId))return;engineRef.current?.stop();setPlaying(false);pushUndo();setClips(current=>deleteSnippet(current,selectedId));setSelectedId(null);},[selectedId,recording,recordPending,clips,pushUndo]);
 React.useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(ignoresGlobalShortcuts(event.target))return;if(event.code==='Space'||event.key===' '){event.preventDefault();if(recordPending)return;if(recording){stopRecordRef.current();return;}togglePlaybackRef.current();return;}if(recording||recordPending)return;if((event.key==='Backspace'||event.key==='Delete')&&selectedId){event.preventDefault();removeSelected();return;}if((event.key==='z'||event.key==='Z')&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(event.shiftKey)redo();else undo();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[selectedId,recording,recordPending,removeSelected,undo,redo]);
 const togglePlaybackRef=React.useRef(()=>{});
 const stopRecordRef=React.useRef(()=>{});
 const selectedTrack=React.useMemo(()=>selectedTrackId?tracks.find(t=>t.id===selectedTrackId)??null:null,[selectedTrackId,tracks]);
 const featureClip=React.useMemo(()=>selectedTrackId?featureClipForTrack(clips,selectedTrackId,selected?.trackId===selectedTrackId?selected.id:null):null,[clips,selectedTrackId,selected?.id,selected?.trackId]);
 const beatClip=React.useMemo(()=>clips.find(c=>c.trackId==='beat'),[clips]);
 const features=useVoiceFeatures(featureClip,beatClip);
 const hasTrackAudio=React.useMemo(()=>selectedTrackId?clips.some(c=>c.trackId===selectedTrackId):false,[clips,selectedTrackId]);
 const aiThread=selectedTrack?(aiThreads[selectedTrack.id]??EMPTY_AI_THREAD):EMPTY_AI_THREAD;
 React.useEffect(()=>{
  const trackId=panel==='effects'&&selectedTrack?selectedTrack.id:null;
  engineRef.current?.setSpectrumAnalysisTrack(trackId);
 },[panel,selectedTrack?.id]);
 const monitorAutotune=React.useMemo(()=>{const preset=selectedTrack?.preset;if(!preset)return null;const node=preset.chain.find(n=>n.type==='autotune'&&n.enabled);if(!node||(node.params.mix??0)<=0)return null;return node.params;},[selectedTrack?.preset]);
 function hasTimelineAudioAhead(at:number){return clips.some(c=>clipTimelineEndSec(c)>at);}
 async function startRecord(trackId=armedId){
  if(recordLock.current||recording)return;recordLock.current=true;setRecordPending(true);setError('');
  const wasPlaying=playing;
  const at=wasPlaying?(engineRef.current?.getSeconds()??positionRef.current):positionRef.current;
  if(!wasPlaying)stopPlayback();
  applyPosition(at);setArmedId(trackId);
  try{
   await recorderRef.current!.start(deviceId);
   recordTarget.current={trackId,start:at,perf:performance.now()};
   setRecordElapsed(0);setRecording(true);
   if(!wasPlaying&&hasTimelineAudioAhead(at)){
    await startEngineAt(at);
   }
  }catch(e){setError(e instanceof Error?e.message:'Could not start recording.');}finally{recordLock.current=false;setRecordPending(false);}
 }
 async function stopRecord(){if(recordLock.current||!recording)return;recordLock.current=true;setRecordPending(true);const target=recordTarget.current;
  try{const buffer=await recorderRef.current!.stop();if(target){pushUndo();const clip=newSnippet(buffer,`Take ${clips.filter(c=>c.trackId===target.trackId).length+1}`,target.trackId,target.start);setClips(current=>[...current,clip]);setSelectedId(clip.id);setSelectedTrackId(target.trackId);applyPosition(target.start+buffer.duration);}}catch(e){setError(e instanceof Error?e.message:'Recording failed.');}finally{recordTarget.current=null;setRecording(false);setRecordElapsed(0);recordTapRef.current=0;stopPlayback();recordLock.current=false;setRecordPending(false);}
 }
 function handleRecordPress(trackId:string,fromTransport=false){if(recordPending)return;if(recording){if(!fromTransport&&recordTarget.current?.trackId!==trackId)return;const now=Date.now();if(now-recordTapRef.current<=RECORD_DOUBLE_TAP_MS){recordTapRef.current=0;void stopRecord();}else recordTapRef.current=now;return;}recordTapRef.current=Date.now();void startRecord(trackId);}
 stopRecordRef.current=()=>{void stopRecord();};
 async function importFiles(files:File[],trackId:string){
  if(recording)return;setImporting(trackId);setError('');const at=positionRef.current;stopPlayback();
  try{const imported=await Promise.all(files.map(async file=>newSnippet(await decodeAudioFile(file),file.name,trackId,at)));pushUndo();setClips(current=>[...current,...imported]);setSelectedId(imported[0]?.id??null);setSelectedTrackId(trackId);}catch(e){setError(e instanceof Error?e.message:'Could not import audio.');}finally{setImporting(null);}
 }
 function chooseImport(trackId:string){importTarget.current=trackId;fileInput.current?.click();}
 function addTrack(){if(tracks.length>=MAX_TRACKS)return;pushUndo();const track=newSessionTrack(crypto.randomUUID(),`Track ${tracks.length+1}`);setTracks(current=>[...current,track]);setArmedId(track.id);}
 function removeTrack(id:string){if(recording||recordPending||importing)return;stopPlayback();pushUndo();setTracks(current=>current.filter(t=>t.id!==id));setClips(current=>current.filter(c=>c.trackId!==id));if(clips.find(c=>c.id===selectedId)?.trackId===id)setSelectedId(null);if(selectedTrackId===id)setSelectedTrackId('vocal');if(armedId===id)setArmedId('vocal');}
 async function play(){if(recording||!clips.length)return;setError('');try{const ok=await startEngineAt(positionRef.current);if(!ok)setError('Nothing to play at the playhead.');}catch{setPlaying(false);setError('Unable to start audio playback. Try Play again.');}}
 function togglePlayback(){if(recording||recordPending)return;if(playing){stopPlayback(true);return;}void play();}
 togglePlaybackRef.current=togglePlayback;
 function setTrackPreset(trackId:string,preset:Preset,options?:{skipUndo?:boolean}){if(!options?.skipUndo)pushUndo();setTracks(current=>current.map(t=>t.id===trackId?{...t,preset}:t));setTrackSources(current=>({...current,[trackId]:'manual'}));}
 function savePresetToSession(name:string){if(!selectedTrack||recording||recordPending)return;const preset=snapshotPreset(selectedTrack.preset);const label=name.trim()||preset.name||'Saved preset';setSavedPresets(current=>[{id:crypto.randomUUID(),name:label,preset,savedAt:Date.now()},...current].slice(0,MAX_SAVED_PRESETS));}
 function applySavedPreset(id:string){if(!selectedTrack||recording||recordPending)return;const entry=savedPresets.find(p=>p.id===id);if(!entry)return;setTrackPreset(selectedTrack.id,presetForApply(entry.preset));}
 function removeSavedPreset(id:string){setSavedPresets(current=>current.filter(p=>p.id!==id));}
 function addEffect(type:EffectType){if(!selectedTrack)return;let params=defaultParams(type);if(type==='autotune'&&features)params=autotuneParamsFromFeatures(features,params);const next={...selectedTrack.preset,chain:[...selectedTrack.preset.chain,{id:crypto.randomUUID(),type,enabled:true,params}]};setTrackPreset(selectedTrack.id,next);}
 function moveEffect(id:string,delta:-1|1){if(!selectedTrack)return;const chain=moveChainNode(selectedTrack.preset.chain,id,delta);setTrackPreset(selectedTrack.id,{...selectedTrack.preset,chain});}
 function clearTrackEffects(){if(!selectedTrack||recording||recordPending)return;const empty=emptyTrackPreset(selectedTrack.name);setTrackPreset(selectedTrack.id,empty);}
 async function requestPresetGenerate(followUp:boolean){
  if(!selectedTrack||!features||!prompt.trim()||generationLock.current)return;
  const trackId=selectedTrack.id;const prior=selectedTrack.preset;const userPrompt=prompt.trim();
  generationLock.current=true;setGenerating(true);setError('');setGenerateSummary(null);
  try{
   const hasThread=(aiThreads[trackId]?.length??0)>0;
   const history=hasThread||followUp?historyForApi(aiThreads,trackId):[];
   const priorFader=mixes[trackId]?.db??0;
   const otherTracks=otherTracksForGenerateApi(tracks,trackId,clips,mixes,trackSources,aiThreads);
   const response=await fetch('/api/presets/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:userPrompt,features,history:history.length?history:undefined,currentPreset:prior.chain.length?prior:undefined,currentTrackVolumeDb:priorFader,currentTrackName:selectedTrack.name,otherTracks:otherTracks.length?otherTracks:undefined})});
   const data=await response.json().catch(()=>null);
   if(!response.ok||!data?.preset)throw new Error(data?.error??'Preset generation failed. Check that the API server is running.');
   const preset=applyAiEffectWhys(stampPresetFromFeatures(validatePreset(data.preset),features),features);
   const trackVolumeDb=preset.trackVolumeDb??priorFader;
   const summary=summarizePresetChanges(prior,preset,{beforeTrackVolumeDb:priorFader,afterTrackVolumeDb:trackVolumeDb});
   stopPlayback();
   pushUndo();
   setTracks(current=>current.map(t=>t.id===trackId?{...t,preset}:t));
   setMixes(current=>({...current,[trackId]:{...(current[trackId]??{db:0,muted:false,solo:false}),db:trackVolumeDb}}));
   setTrackGenerated(current=>({...current,[trackId]:structuredClone(preset)}));
   setTrackSources(current=>({...current,[trackId]:data.source??'model'}));
   setGenerateSummary(summary);
   setAiThreads(current=>appendAiTurn(current,trackId,{prompt:userPrompt,name:preset.name,explanation:preset.explanation,source:data.source??'model',summary,at:Date.now()}));
   setPrompt('');
   setPanel('effects');
  }catch(e){setError(e instanceof Error?e.message:'Preset generation failed.');}finally{generationLock.current=false;setGenerating(false);}
 }
 async function generate(event:React.FormEvent){event.preventDefault();await requestPresetGenerate(false);}
 async function followUp(event:React.FormEvent){event.preventDefault();await requestPresetGenerate(true);}
 function newAiConversation(){if(!selectedTrack)return;setAiThreads(current=>clearAiThread(current,selectedTrack.id));}
 function moveClipToTrack(clipId:string,destTrackId:string){if(recording||recordPending)return;const clip=clips.find(c=>c.id===clipId);if(!clip||clip.trackId===destTrackId)return;pushUndo();updateClip(clipId,{trackId:destTrackId},true);}
 async function exportMix(){if(!clips.length||exporting||recording||recordPending)return;const engine=engineRef.current;if(!engine)return;setExporting(true);exportingRef.current=true;setError('');try{await exportTimelineWav(engine,async()=>{stopPlayback(true);return await startEngineAt(0);});}catch(e){setError(e instanceof Error?e.message:'Export failed.');}finally{exportingRef.current=false;setExporting(false);stopPlayback();}}
 const trackEdited=selectedTrack&&trackGenerated[selectedTrack.id]?JSON.stringify(selectedTrack.preset)!==JSON.stringify(trackGenerated[selectedTrack.id]):false;
 return <TimelineScale.Provider value={zoom}><div className="daw" style={{'--px-per-sec':`${zoom}px`} as React.CSSProperties}>
  <TopBar playing={playing} recording={recording} pending={recordPending||projectSwitching} canPlay={clips.length>0&&!recordPending&&!projectSwitching} canExport={clips.length>0} exporting={exporting} positionSec={positionSec} dry={dry} loop={loop} masterDb={masterDb} onTogglePlay={togglePlayback} onRecord={()=>handleRecordPress(armedId,true)} onDryChange={setDry} onLoopChange={setLoop} onExport={()=>void exportMix()} onMasterDbChange={setMasterDb} projects={projects} activeProjectId={projectId} projectsDisabled={recording||recordPending||projectSwitching} onSelectProject={id=>void selectProject(id)} onNewProject={()=>void createProject()} onRenameProject={renameProject} onDeleteProject={id=>void deleteProject(id)} canDeleteProject={projects.length>1}/>
  <InputPanel deviceId={deviceId} onDeviceChange={setDeviceId} recording={recording||recordPending} monitorAutotune={monitorAutotune}/>
  <div className="session-toolbar"><label>Record into <select value={armedId} disabled={recording||recordPending} onChange={e=>setArmedId(e.target.value)}>{tracks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{recordPending||recording?<span>{recordPending?'Preparing…':`Recording — ${recordElapsed.toFixed(0)}s`}</span>:null}</div>
  {error&&<p className="session-error" role="alert">{error}</p>}
  <input ref={fileInput} type="file" multiple accept={AUDIO_FILE_ACCEPT} hidden onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)void importFiles(files,importTarget.current);}}/>
  <nav className="mobile-studio-nav" aria-label="Studio view">{(['timeline','inspector','mixer'] as const).map(view=><button key={view} type="button" aria-pressed={mobileView===view} onClick={()=>setMobileView(view)}>{view==='timeline'?'Tracks':view==='inspector'?'Clip & effects':'Mixer'}</button>)}</nav>
  <div className={`studio-work-area mobile-view-${mobileView}`}>
  <div className="daw-arrangement"><div className="arrangement-h-scroll"><div className="arrangement-canvas" style={{'--timeline-sec':timelineDuration} as React.CSSProperties}>
   <TimelineRuler durationSec={timelineDuration} seekDisabled={recording||recordPending} onJump={jumpTo}/>
   {tracks.map(track=>{const layout=overlapRows(clips.filter(c=>c.trackId===track.id));const isRecording=recording&&recordTarget.current?.trackId===track.id;
    return <section key={track.id} className={`track-lane snippet-lane${dropTargetTrackId===track.id?' track-lane--drop-target':''}${selectedTrackId===track.id?' track-lane--selected':''}`} aria-label={`${track.name} track`} onDragOver={e=>{if(recording||recordPending||!clipDragId)return;e.preventDefault();setDropTargetTrackId(track.id);}} onDragLeave={()=>{if(dropTargetTrackId===track.id)setDropTargetTrackId(null);}} onDrop={e=>{e.preventDefault();const id=clipDragId;if(id)setDropTargetTrackId(null);setClipDragId(null);if(id)moveClipToTrack(id,track.id);}}>
     <div className="track-lane-header" onClick={e=>{if((e.target as HTMLElement).closest('button,input,select'))return;setSelectedTrackId(track.id);}}><input className="track-name-input" aria-label={`Rename ${track.name}`} value={track.name} maxLength={40} disabled={recording} onFocus={()=>pushUndo()} onChange={e=>setTracks(current=>current.map(t=>t.id===track.id?{...t,name:e.target.value}:t))}/><span className="track-lane-meta">{layout.clips.length} clip{layout.clips.length===1?'':'s'}</span>
      <div className="track-lane-actions"><button type="button" className={`track-record-button${isRecording?' track-record-button--active':''}`} disabled={recordPending||(recording&&!isRecording)} title={isRecording?'Double-click to stop · Space to stop':'Record on this track'} onClick={()=>handleRecordPress(track.id)}>{isRecording?'Recording':'Record'}</button><button type="button" disabled={!!importing||recording||recordPending} onClick={()=>chooseImport(track.id)}><Upload size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>{importing===track.id?'…':'Import'}</button>{!['beat','vocal'].includes(track.id)&&<button type="button" disabled={recording||recordPending||!!importing} onClick={()=>removeTrack(track.id)}>Remove</button>}</div><button className="arm-track" type="button" aria-pressed={armedId===track.id} disabled={recording||recordPending} onClick={()=>setArmedId(track.id)}>{armedId===track.id?'Target':'Set target'}</button>
     </div>
     <div className="track-lane-clip track-lane-clip--timeline"><div className="track-timeline-body snippet-body" style={{width:timelineDuration*zoom,height:Math.max(layout.rowCount+(isRecording?1:0),1)*104,minHeight:104}}>
      {layout.clips.map(({clip,row})=><div key={clip.id} className={`timeline-clip snippet-clip timeline-clip--audio${selectedId===clip.id?' snippet-selected':''}${clip.muted?' snippet-muted':''}`} style={{left:clipTimelineStartSec(clip)*zoom,width:Math.max(4,(clip.trim.end-clip.trim.start)*zoom),top:row*104+6,height:90,bottom:'auto'}} onPointerDownCapture={()=>{if(!recording){setSelectedId(clip.id);setSelectedTrackId(clip.trackId);}}}>
       <button type="button" className="snippet-title" draggable={!recording&&!recordPending} aria-label={`Select ${clip.name}`} onClick={()=>{setSelectedId(clip.id);setSelectedTrackId(clip.trackId);}} onDragStart={e=>{if(recording||recordPending)return;e.stopPropagation();setClipDragId(clip.id);e.dataTransfer.setData('text/plain',clip.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{setClipDragId(null);setDropTargetTrackId(null);}}>{clip.name}</button>
       <div className="snippet-wave"><TrimWaveViewport buffer={clip.buffer} trim={clip.trim} timelineStartSec={clipTimelineStartSec(clip)} onGestureStart={pushUndo} onTrimChange={trim=>updateClip(clip.id,{trim},true)} onTimelineStartChange={start=>updateClip(clip.id,{clipStartSec:anchorForTimelineStart(start,clip.trim)},true)}/></div>
      </div>)}
      {isRecording&&<div className="timeline-clip timeline-clip--recording" style={{left:(recordTarget.current?.start??0)*zoom,width:Math.max(4,recordElapsed*zoom),top:layout.rowCount*104+6,height:90,bottom:'auto'}}><span className="recording-label">Recording {recordElapsed.toFixed(1)}s</span></div>}
      {!layout.clips.length&&!isRecording&&<p className="timeline-empty-hint">Record or import to start</p>}
     </div></div>
    </section>;
   })}
   <TimelinePlayhead positionSec={positionSec} durationSec={timelineDuration} disabled={recording||recordPending} onSeek={seek} onJump={jumpTo}/>
  </div></div><div className="arrangement-toolbar"><button type="button" className="arrangement-toolbar-btn arrangement-toolbar-btn--primary" disabled={tracks.length>=MAX_TRACKS||recording||recordPending} onClick={addTrack}>Add track</button><button type="button" className="arrangement-toolbar-btn" disabled={undoStack.length===0||recording||recordPending} onClick={undo} title="Undo (⌘Z)"><Undo2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>Undo</button><button type="button" className="arrangement-toolbar-btn" disabled={redoStack.length===0||recording||recordPending} onClick={redo} title="Redo (⇧⌘Z)"><Redo2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>Redo</button><button type="button" className="arrangement-toolbar-btn arrangement-toolbar-btn--danger" disabled={!selected||recording||recordPending} onClick={removeSelected} title="Delete clip (⌫)"><Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>Delete</button><label className="timeline-zoom">Zoom <input aria-label="Timeline zoom" type="range" min={20} max={120} step={10} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div></div>
  <aside className="sound-workspace" aria-label="Sound inspector">
   <div className="inspector-tabs" role="tablist" aria-label="Inspector">{(['clip','effects','ai'] as const).map(tab=>{const TabIcon=tab==='clip'?AudioWaveform:tab==='effects'?SlidersHorizontal:Wand2;const label=tab==='clip'?'Clip':tab==='effects'?'Effects':'AI';return <button key={tab} id={`tab-${tab}`} type="button" role="tab" aria-selected={panel===tab} aria-controls={`panel-${tab}`} tabIndex={panel===tab?0:-1} onClick={()=>setPanel(tab)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const tabs=['clip','effects','ai'] as const;const next=tabs[(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:2))%3];setPanel(next);document.getElementById(`tab-${next}`)?.focus();}}}><TabIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>{label}</button>;})}</div>
   <p className="inspector-subtitle">{panel==='clip'?(selected?selected.name:'Select a clip'):selectedTrack?selectedTrack.name:'Select a track'}</p>
   <div className="inspector-content">
   <section className="daw-rack inspector-panel" hidden={panel==='ai'}>
   <div id="panel-clip" className="inspector-stack" role="tabpanel" aria-labelledby="tab-clip" hidden={panel!=='clip'}>
   {selected?<><label className="clip-name">Clip name<input maxLength={80} value={selected.name} disabled={recording} onFocus={()=>{if(!clipNameUndoPushedRef.current){pushUndo();clipNameUndoPushedRef.current=true;}}} onBlur={()=>{clipNameUndoPushedRef.current=false;}} onChange={e=>updateClip(selected.id,{name:e.target.value})}/></label><div className="clip-settings">
    <label>Volume · {selected.volumeDb} dB<input aria-label="Clip volume" type="range" min={-36} max={12} value={selected.volumeDb} onPointerDown={()=>pushUndo()} onChange={e=>updateClip(selected.id,{volumeDb:Number(e.target.value)})}/></label>
    <label>Pan · {selected.pan===0?'Center':selected.pan<0?'Left':'Right'}<input aria-label="Clip pan" type="range" min={-1} max={1} step={.05} value={selected.pan} onPointerDown={()=>pushUndo()} onChange={e=>updateClip(selected.id,{pan:Number(e.target.value)})}/></label>
    <label>Fade in · {selected.fadeIn.toFixed(2)}s<input aria-label="Clip fade in" type="range" min={0} max={Math.min(5,(selected.trim.end-selected.trim.start)/2)} step={.01} value={Math.min(selected.fadeIn,(selected.trim.end-selected.trim.start)/2)} onPointerDown={()=>pushUndo()} onChange={e=>updateClip(selected.id,{fadeIn:Number(e.target.value)},true)}/></label>
    <label>Fade out · {selected.fadeOut.toFixed(2)}s<input aria-label="Clip fade out" type="range" min={0} max={Math.min(5,(selected.trim.end-selected.trim.start)/2)} step={.01} value={Math.min(selected.fadeOut,(selected.trim.end-selected.trim.start)/2)} onPointerDown={()=>pushUndo()} onChange={e=>updateClip(selected.id,{fadeOut:Number(e.target.value)},true)}/></label>
   </div><ToggleButton pressed={selected.muted} size="sm" onToggle={()=>{pushUndo();updateClip(selected.id,{muted:!selected.muted});}} title="Mute this clip on the timeline"><VolumeX size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>Mute clip</ToggleButton>
   <details className="voice-details"><summary>Audio measurements</summary>{features&&<FeatureList features={features} warnings={featureWarnings(features)}/>}</details>
   <p className="clip-location">{clipTimelineStartSec(selected).toFixed(2)}s on timeline · {(selected.trim.end-selected.trim.start).toFixed(2)}s long</p>
   <button className="inspector-delete" type="button" disabled={recording||recordPending} onClick={removeSelected}><Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden/>Delete clip</button>
   </>:<InspectorEmpty>Select a clip on the timeline</InspectorEmpty>}
   </div>
   <div id="panel-effects" className="inspector-stack" role="tabpanel" aria-labelledby="tab-effects" hidden={panel!=='effects'}>
   {!selectedTrack?<InspectorEmpty>Select a track</InspectorEmpty>:<>
   {!hasTrackAudio?<InspectorEmpty>Import or record on {selectedTrack.name}</InspectorEmpty>:<>
   <div className="effect-picker">{EFFECT_CATALOG.map(type=><button key={type} type="button" disabled={recording} onClick={()=>addEffect(type)}>+ {effectDisplayName(type)}</button>)}</div>
   {selectedTrack.preset.chain.length>0?<EffectsPanel trackLabel={selectedTrack.name} trackId={selectedTrack.id} getSpectrumDb={()=>engineRef.current?.getTrackSpectrumDb(selectedTrack.id)??null} audioSampleRate={engineRef.current?.getAudioSampleRate()??48000} preset={selectedTrack.preset} source={trackSources[selectedTrack.id]??'manual'} editedSinceGenerate={!!trackEdited} generateSummary={generateSummary} features={features} aiGeneratedNodeIds={trackGenerated[selectedTrack.id]?new Set(trackGenerated[selectedTrack.id].chain.map(n=>n.id)):undefined} clearAllDisabled={recording||recordPending} onClearAll={clearTrackEffects} onMove={moveEffect} onEditStart={pushUndo} onParamChange={(id,key,value)=>setTrackPreset(selectedTrack.id,{...selectedTrack.preset,chain:selectedTrack.preset.chain.map(n=>{if(n.id!==id)return n;if(n.type==='autotune')return{...n,params:normalizeAutotuneMixParams({...n.params,[key]:value})};return{...n,params:{...n.params,[key]:value}};})},{skipUndo:true})} onEnabledChange={(id,enabled)=>setTrackPreset(selectedTrack.id,{...selectedTrack.preset,chain:selectedTrack.preset.chain.map(n=>n.id===id?{...n,enabled}:n)})} onRemove={id=>setTrackPreset(selectedTrack.id,{...selectedTrack.preset,chain:selectedTrack.preset.chain.filter(n=>n.id!==id)})} onReset={trackGenerated[selectedTrack.id]?()=>{pushUndo();setTracks(current=>current.map(t=>t.id===selectedTrack.id?{...t,preset:structuredClone(trackGenerated[selectedTrack.id])}:t));}:undefined}/>:null}
   </>}
   <SavedPresetsPanel disabled={recording||recordPending} currentPresetName={selectedTrack.preset.name??''} savedPresets={savedPresets} onSave={savePresetToSession} onApply={applySavedPreset} onRemove={removeSavedPreset}/>
   </>}
   </div>
  </section><section className="daw-prompt inspector-panel" id="panel-ai" role="tabpanel" aria-labelledby="tab-ai" hidden={panel!=='ai'}>{!selectedTrack?<InspectorEmpty>Select a track</InspectorEmpty>:<PromptBox prompt={prompt} busy={generating||recording} hasTrackAudio={hasTrackAudio} features={features} thread={aiThread} onPromptChange={setPrompt} onGenerate={generate} onFollowUp={followUp} onNewConversation={newAiConversation}/>}</section></div></aside>
  <div className="studio-mixer"><TrackMixer tracks={tracks} mixes={mixes} onBeforeChange={pushUndo} onChange={(id,mix)=>setMixes(current=>({...current,[id]:mix}))}/></div>
  </div>
  <footer className="studio-status"><span>{recording?`Recording · ${recordElapsed.toFixed(0)}s`:playing?'Playing':'Stopped'}</span><span>{tracks.length} tracks · {clips.length} clips</span></footer>
 </div></TimelineScale.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
