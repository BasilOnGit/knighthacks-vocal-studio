import React from 'react';
import { useTimelineScale } from '../session/TimelineScale';
import { resizedTrim } from '../audio/clipEditing';
import type { TrimRange } from '../../../../shared/types';

type Props = {
 buffer: AudioBuffer; trim: TrimRange; timelineStartSec: number;
 onTrimChange: (trim: TrimRange) => void; onTimelineStartChange: (start: number) => void;
};
type Drag = {pointerId: number; originX: number; start: number; trim: TrimRange; kind: 'move' | 'start' | 'end'};
export function TrimWaveViewport({buffer,trim,timelineStartSec,onTrimChange,onTimelineStartChange}: Props) {
 const {secToPx,pxPerSec}=useTimelineScale();
 const canvasRef=React.useRef<HTMLCanvasElement>(null);
 const dragRef=React.useRef<Drag | null>(null);
 const [preview,setPreview]=React.useState<TrimRange | null>(null);
 const previewRef=React.useRef<TrimRange | null>(null);
 const [kind,setKind]=React.useState<Drag['kind'] | null>(null);
 const selected=preview ?? trim;
 const peaks=React.useMemo(()=>{
   const width=Math.max(1,Math.min(16384,Math.ceil(buffer.duration*pxPerSec)));
   const data=new Float32Array(width);
   const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
   for(let x=0;x<width;x++){
     const from=Math.floor(x*buffer.length/width);const to=Math.max(from+1,Math.floor((x+1)*buffer.length/width));
     for(const channel of channels)for(let i=from;i<to;i++)data[x]=Math.max(data[x],Math.abs(channel[i] ?? 0));
   }
   return data;
 },[buffer,pxPerSec]);
 React.useEffect(()=>{
   const canvas=canvasRef.current;if(!canvas)return;
   const width=peaks.length;canvas.width=width;canvas.height=76;
   const context=canvas.getContext('2d');if(!context)return;
   for(let x=0;x<width;x++){
     const second=(x/width)*buffer.duration;
     context.fillStyle=second>=selected.start&&second<=selected.end?'#b3a0ff':'#6c7894';
     const height=Math.max(1,peaks[x]*66);context.fillRect(x,(76-height)/2,1,height);
   }
 },[peaks,buffer.duration,selected.start,selected.end]);
 function begin(event: React.PointerEvent<HTMLDivElement>) {
   if(event.button!==0)return;
   const handle=(event.target as HTMLElement).closest('[data-trim-edge]') as HTMLElement | null;
   const nextKind=(handle?.dataset.trimEdge as 'start'|'end'|undefined) ?? 'move';
   event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
   dragRef.current={pointerId:event.pointerId,originX:event.clientX,start:timelineStartSec,trim:{...trim},kind:nextKind};
   setKind(nextKind);
   if(nextKind!=='move'){setPreview(trim);previewRef.current=trim;}
 }
 function move(event: React.PointerEvent<HTMLDivElement>){
   const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;
   const delta=(event.clientX-drag.originX)/pxPerSec;
   if(drag.kind==='move'){onTimelineStartChange(Math.max(0,drag.start+delta));return;}
   const next=resizedTrim(drag.trim,drag.kind,delta,buffer.duration,drag.start);
   previewRef.current=next;setPreview(next);
 }
 function end(event: React.PointerEvent<HTMLDivElement>,cancel=false){
   const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;
   if(!cancel&&drag.kind!=='move'&&previewRef.current)onTrimChange(previewRef.current);
   if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
   dragRef.current=null;previewRef.current=null;setKind(null);setPreview(null);
 }
 const resizing=kind==='start'||kind==='end';
 return <div className={`trim-wave-viewport${resizing?' trim-wave-viewport--resizing':''}${kind==='move'?' trim-wave-viewport--dragging':''}`}
   onPointerDown={begin} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)}>
   <div className="source-wave" style={{left:-secToPx(trim.start),width:secToPx(buffer.duration)}}>
     <canvas ref={canvasRef} aria-label="Audio waveform with retained audio highlighted" style={{width:'100%',height:76}}/>
   </div>
   {resizing&&<div className="trim-preview-selection" style={{left:secToPx(selected.start-trim.start),width:secToPx(selected.end-selected.start)}}/>}
   <button type="button" className="trim-edge trim-edge--start" data-trim-edge="start" aria-label="Trim clip start" style={{left:resizing?secToPx(selected.start-trim.start):0}}
     onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onTrimChange(resizedTrim(trim,'start',(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:.05),buffer.duration,timelineStartSec));}}}>⠿</button>
   <button type="button" className="trim-edge trim-edge--end" data-trim-edge="end" aria-label="Trim clip end" style={{right:resizing?-secToPx(selected.end-trim.end):0}}
     onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onTrimChange(resizedTrim(trim,'end',(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:.05),buffer.duration,timelineStartSec));}}}>⠿</button>
   {resizing&&<span className="trim-preview-label">{selected.start.toFixed(2)}–{selected.end.toFixed(2)}s · {(selected.end-selected.start).toFixed(2)}s</span>}
 </div>;
}
