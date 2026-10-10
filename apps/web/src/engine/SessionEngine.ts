import * as Tone from 'tone';
import { VocalChain } from '../chain/VocalChain';
import type { Snippet } from '../session/snippets';
import { clipTimelineStartSec, clipTimelineEndSec } from '../session/clip';
import type { Mix } from '../ui/TrackMixer';

type Slot = {clip: Snippet; player: Tone.Player; chain: VocalChain; dry: Tone.Gain; wet: Tone.Gain; gain: Tone.Gain; pan: Tone.Panner; trackGain: Tone.Gain; chainKey: string};
export class SessionEngine {
 private slots=new Map<string,Slot>();
 private master: Tone.Gain;
 private limiter: Tone.Limiter;
 private endEvent: number | null=null;
 private dry=false;
 private revision=0;
 constructor(private onEnded:()=>void) {
  this.master=new Tone.Gain(1);this.limiter=new Tone.Limiter(-1).toDestination();this.master.connect(this.limiter);
 }
 sync(clips: Snippet[]): void {
  const ids=new Set(clips.map(c=>c.id));
  for(const [id,slot] of this.slots)if(!ids.has(id)){this.disposeSlot(slot);this.slots.delete(id);}
  for(const clip of clips){
   let slot=this.slots.get(clip.id);
   if(!slot){
    const player=new Tone.Player();const chain=new VocalChain();const dry=new Tone.Gain(this.dry?1:0);const wet=new Tone.Gain(this.dry?0:1);const gain=new Tone.Gain(1);const pan=new Tone.Panner(clip.pan);const trackGain=new Tone.Gain(1);
    player.connect(dry);player.connect(chain.input);chain.output.connect(wet);dry.connect(gain);wet.connect(gain);gain.connect(pan);pan.connect(trackGain);trackGain.connect(this.master);
    player.buffer.set(clip.buffer);slot={clip,player,chain,dry,wet,gain,pan,trackGain,chainKey:''};this.slots.set(clip.id,slot);
   }
   const key=clip.preset.chain.map(n=>`${n.id}:${n.type}`).join('|');
   if(slot.chainKey!==key){slot.chain.setChain(clip.preset);slot.chainKey=key;}
   else if(slot.clip.preset!==clip.preset) for(const node of clip.preset.chain){
    const previous=slot.clip.preset.chain.find(n=>n.id===node.id);
    if(previous?.enabled!==node.enabled)slot.chain.setEnabled(node.id,node.enabled);
    for(const [key,value] of Object.entries(node.params))if(previous?.params[key]!==value)slot.chain.updateParam(node.id,key,value);
   }
   slot.pan.pan.rampTo(clip.pan,.03);slot.gain.gain.rampTo(clip.muted?0:Tone.dbToGain(clip.volumeDb),.03);slot.clip=clip;
  }
 }
 setMixes(mixes: Record<string,Mix>, trackIds: string[]): void {
  const anySolo=trackIds.some(id=>mixes[id]?.solo);
  for(const slot of this.slots.values()){
   const mix=mixes[slot.clip.trackId]??{db:0,muted:false,solo:false};
   slot.trackGain.gain.rampTo(mix.muted||(anySolo&&!mix.solo)?0:Tone.dbToGain(mix.db),.03);
  }
 }
 setMasterGain(db:number){this.master.gain.rampTo(Tone.dbToGain(db),.03);}
 setBypass(dry:boolean){this.dry=dry;for(const slot of this.slots.values()){slot.dry.gain.rampTo(dry?1:0,.03);slot.wet.gain.rampTo(dry?0:1,.03);}}
 getSeconds(){return Tone.getTransport().seconds;}
 stop(){this.revision++;const transport=Tone.getTransport();if(this.endEvent!==null){transport.clear(this.endEvent);this.endEvent=null;}for(const slot of this.slots.values())slot.player.unsync();transport.stop();transport.seconds=0;}
 async play(from:number): Promise<boolean>{
  this.stop();const revision=this.revision;await Tone.start();if(revision!==this.revision)return false;
  const transport=Tone.getTransport();const start=Math.max(0,from);
  let end=start;
  for(const slot of this.slots.values()){
   const clip=slot.clip;const clipStart=clipTimelineStartSec(clip);const clipEnd=clipTimelineEndSec(clip);if(clipEnd<=start)continue;
   const elapsed=Math.max(0,start-clipStart);const duration=clip.trim.end-clip.trim.start;
   const fadeIn=Math.min(clip.fadeIn,duration/2);const fadeOut=Math.min(clip.fadeOut,duration/2);
   // Schedule the envelope relative to source position, so seeking preserves the fade.
   const envelope=slot.gain.gain;const amplitude=clip.muted?0:Tone.dbToGain(clip.volumeDb);
   envelope.cancelScheduledValues(Tone.now());
   const offset=clip.trim.start+elapsed;const remaining=clipEnd-Math.max(clipStart,start);
   slot.player.fadeIn=elapsed===0?fadeIn:0;slot.player.fadeOut=Math.min(fadeOut,remaining);
   envelope.value=amplitude;
   slot.player.sync().start(Math.max(start,clipStart),offset,remaining);
   end=Math.max(end,clipEnd);
  }
  if(end<=start){this.onEnded();return false;}
  transport.seconds=start;
  this.endEvent=transport.scheduleOnce(()=>{this.stop();this.onEnded();},end+.05);transport.start();return true;
 }
 private disposeSlot(slot: Slot){slot.player.unsync();slot.player.dispose();slot.chain.dispose();slot.dry.dispose();slot.wet.dispose();slot.gain.dispose();slot.pan.dispose();slot.trackGain.dispose();}
 dispose(){this.stop();for(const slot of this.slots.values())this.disposeSlot(slot);this.slots.clear();this.master.dispose();this.limiter.dispose();}
}
