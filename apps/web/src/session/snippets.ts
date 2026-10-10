import type { Preset } from '../../../../shared/types';
import type { SessionAudioClip } from './clip.ts';
import { clipTimelineStartSec, clipTimelineEndSec, createSessionClip } from './clip.ts';
export type Snippet = SessionAudioClip & {
 id: string; trackId: string; name: string; volumeDb: number; pan: number;
 muted: boolean; fadeIn: number; fadeOut: number; preset: Preset;
};
export type SessionTrack = {id: string; name: string};
export function newSnippet(buffer: AudioBuffer, name: string, trackId: string, at: number, id = crypto.randomUUID()): Snippet {
 return {...createSessionClip(buffer,name,at),id,trackId,name,volumeDb:0,pan:0,muted:false,fadeIn:0,fadeOut:0,preset:{name:'Clip effects',explanation:'',chain:[]}};
}
/** Overlapping clips get separate visual rows while retaining the same audio track. */
export function overlapRows(clips: Snippet[]): {clips: {clip: Snippet; row: number}[]; rowCount: number} {
 const ends: number[]=[];
 const result=[...clips].sort((a,b)=>clipTimelineStartSec(a)-clipTimelineStartSec(b)).map(clip=>{
   const start=clipTimelineStartSec(clip);let row=ends.findIndex(end=>end<=start+1e-8);
   if(row===-1){row=ends.length;ends.push(0);}ends[row]=clipTimelineEndSec(clip);
   return {clip,row};
 });return {clips:result,rowCount:Math.max(1,ends.length)};
}
export function deleteSnippet(clips: Snippet[], id: string): Snippet[] { return clips.filter(clip=>clip.id!==id); }
export function ignoresDeleteShortcut(target: EventTarget | null): boolean {
 const node=target as HTMLElement | null;
 return !!node?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}
